import { type ExecutionContext } from '@nestjs/common';
import { type ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Rate limiting for a mostly-read catalogue.
 *
 * The shape of the traffic here is the opposite of account-service's. There is
 * no bcrypt and no password to guess: the expensive, dangerous surface is not
 * the reads, it is the handful of ADMIN writes. So the two buckets are split by
 * what a request COSTS rather than by what it is aimed at:
 *
 *   `ip`    - counted per client address per route, applied to everything.
 *             Deliberately generous: `GET /products` is a paginated indexed
 *             query, and a product grid legitimately fires several of them per
 *             page view. This bucket exists to stop a scraper hammering the
 *             database, not to ration normal browsing.
 *   `write` - counted per client address per route as well, but only for
 *             mutating methods (POST/PATCH/PUT/DELETE). Much tighter, because
 *             every write takes a row lock and is reachable only by an ADMIN,
 *             who has no reason to make hundreds a minute. It also caps how
 *             fast an admin token, once stolen, can rewrite or delete the
 *             catalogue.
 *
 * Why split by method instead of decorating each write handler with
 * `@Throttle()`: a new ADMIN endpoint is then covered the day it is added.
 * Forgetting a decorator would silently leave it unlimited, and the whole point
 * of the deny-by-default guards in this service is that omissions fail closed.
 *
 * Two deployment caveats, identical to account-service's:
 *
 *   * Requests the Next.js frontend makes server-side arrive from the frontend
 *     container's address, so all of its users share one bucket - another
 *     reason the `ip` limit is roomy. A genuinely per-client limit belongs at
 *     the edge, as a Traefik `ratelimit` middleware.
 *   * The counters live in this process's memory. Run two replicas and each
 *     enforces its own half of the limit; a shared store (Redis) is the fix,
 *     and is one of the things stage 4/5 of the roadmap makes you confront.
 */

/** Every bucket below is counted over one minute. */
export const THROTTLE_WINDOW_MS = 60_000;

/**
 * Blunt per-address, per-route ceiling applied to every endpoint. Higher than
 * account-service's because reads here are cheap and a catalogue page issues
 * several of them; low enough that a scraper walking every page trips it.
 */
export const THROTTLE_IP_LIMIT = 300;

/**
 * Mutating requests per minute from one address, per route. An ADMIN editing
 * the catalogue by hand never gets near it; a script bulk-deleting it does.
 */
export const THROTTLE_WRITE_LIMIT = 20;

/** HTTP methods that change state. Everything else is a read and skips the `write` bucket. */
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * The request object as seen by the throttler, which types it as an untyped
 * record. Everything is read defensively rather than cast, so a non-HTTP or
 * method-less request cannot throw inside a guard.
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

/** True when this request would change the catalogue rather than just read it. */
function isMutating(request: ThrottledRequest): boolean {
  const method = request.method;
  return typeof method === 'string' && MUTATING_METHODS.has(method.toUpperCase());
}

/**
 * Passed to `@SkipThrottle()`, which otherwise only skips a throttler literally
 * named "default" - naming the buckets means the skip list has to name them
 * too, so keep it here next to the definitions rather than in each controller.
 *
 * The same rule bites on the wire: a named throttler suffixes its response
 * headers with its own name, so clients see `X-RateLimit-Limit-ip` and
 * `Retry-After-write`, never the unsuffixed spellings. Renaming a bucket is
 * therefore a breaking change for anything parsing those headers.
 */
export const SKIP_ALL_THROTTLERS: Record<string, boolean> = { ip: true, write: true };

export const throttlerOptions: ThrottlerModuleOptions = {
  throttlers: [
    {
      name: 'ip',
      ttl: THROTTLE_WINDOW_MS,
      limit: THROTTLE_IP_LIMIT,
    },
    {
      name: 'write',
      ttl: THROTTLE_WINDOW_MS,
      limit: THROTTLE_WRITE_LIMIT,
      // Reads are left to the `ip` bucket alone.
      skipIf: (context: ExecutionContext): boolean => !isMutating(requestOf(context)),
      // Spelled out rather than left to the default tracker so the trusted
      // forwarded address is read the same way in both buckets, and so a change
      // to `trust proxy` shows up in one place. The throttler already folds the
      // controller and handler into the storage key, so this is per route.
      getTracker: (request: ThrottledRequest): string => clientIp(request),
    },
  ],
};
