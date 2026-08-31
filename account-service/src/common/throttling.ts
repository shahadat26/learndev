import { type ExecutionContext } from '@nestjs/common';
import { type ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Rate limiting for a service whose front door is a password check.
 *
 * `/auth/login` and `/auth/register` are public, reachable from the internet
 * through Traefik, and every call spends a bcrypt hash at cost 12 - roughly
 * half a second of main-thread CPU. Without a limit that is two free attacks:
 * unlimited credential stuffing against a known address (`admin@shop.local` is
 * in the README), and CPU exhaustion, where a handful of concurrent requests
 * saturate the single Node event loop until `/health` stops answering and
 * compose marks the container unhealthy.
 *
 * Two buckets, because they stop different things:
 *
 *   `ip`         - counted per client address per route. Bounds how much work
 *                  one source can force the process to do.
 *   `credential` - counted per (address, email) pair per route, and only for
 *                  requests that actually carry an email. This is the
 *                  anti-stuffing bucket: guesses against one account are capped
 *                  however many addresses they are spread over.
 *
 * Why both: an attacker flooding with *random* emails never fills a credential
 * bucket, and an attacker distributing guesses for one account across a botnet
 * never fills an IP bucket.
 *
 * Two deployment caveats worth knowing:
 *
 *   * Requests the Next.js frontend makes server-side arrive from the frontend
 *     container's address, so all of its users share one `ip` bucket - hence
 *     the deliberately roomy per-IP limits, with the strict cap carried by the
 *     `credential` bucket, which is per user either way. A genuinely per-client
 *     limit belongs at the edge, as a Traefik `ratelimit` middleware.
 *   * The counters live in this process's memory. Run two replicas and each
 *     enforces its own half of the limit; a shared store (Redis) is the fix,
 *     and is one of the things stage 4/5 of the roadmap makes you confront.
 */

/** Every bucket below is counted over one minute. */
export const THROTTLE_WINDOW_MS = 60_000;

/** Blunt per-address, per-route ceiling applied to every endpoint. */
export const THROTTLE_IP_LIMIT = 100;

/**
 * Login and register. 20 bcrypt hashes a minute is ~10-20s of CPU: annoying,
 * not fatal, and far above anything a real client does.
 */
export const THROTTLE_AUTH_IP_LIMIT = 20;

/** Token rotation also hashes, but a busy browser session legitimately repeats it. */
export const THROTTLE_REFRESH_IP_LIMIT = 30;

/** Password attempts per minute against a single email address. */
export const THROTTLE_CREDENTIAL_LIMIT = 5;

/**
 * The request object as seen by the throttler, which types it as an untyped
 * record. Everything is read defensively rather than cast, so a non-HTTP or
 * body-less request cannot throw inside a guard.
 */
type ThrottledRequest = Record<string, unknown>;

function requestOf(context: ExecutionContext): ThrottledRequest {
  return context.switchToHttp().getRequest<ThrottledRequest>();
}

/**
 * `app.set('trust proxy', 1)` in main.ts makes Express populate `req.ips` from
 * the single hop we trust (Traefik), so a client cannot choose its own bucket
 * by sending its own X-Forwarded-For.
 */
function clientIp(request: ThrottledRequest): string {
  const forwarded = request.ips;
  if (Array.isArray(forwarded) && typeof forwarded[0] === 'string') {
    return forwarded[0];
  }
  return typeof request.ip === 'string' ? request.ip : 'unknown';
}

/** The email a login/register attempt is aimed at, if this request has one. */
function credentialOf(request: ThrottledRequest): string | undefined {
  const body = request.body;
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const email = (body as Record<string, unknown>).email;
  if (typeof email !== 'string') {
    return undefined;
  }

  const normalised = email.trim().toLowerCase();
  return normalised.length > 0 ? normalised : undefined;
}

/**
 * Passed to `@SkipThrottle()`, which otherwise only skips a throttler literally
 * named "default" - naming the buckets means the skip list has to name them
 * too, so keep it here next to the definitions rather than in each controller.
 */
export const SKIP_ALL_THROTTLERS: Record<string, boolean> = { ip: true, credential: true };

export const throttlerOptions: ThrottlerModuleOptions = {
  throttlers: [
    {
      name: 'ip',
      ttl: THROTTLE_WINDOW_MS,
      limit: THROTTLE_IP_LIMIT,
    },
    {
      name: 'credential',
      ttl: THROTTLE_WINDOW_MS,
      limit: THROTTLE_CREDENTIAL_LIMIT,
      // Only meaningful where an email is being tried; every other route is
      // left to the `ip` bucket alone.
      skipIf: (context: ExecutionContext): boolean =>
        credentialOf(requestOf(context)) === undefined,
      getTracker: (request: ThrottledRequest): string =>
        `${clientIp(request)}|${credentialOf(request) ?? ''}`,
    },
  ],
};
