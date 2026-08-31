import { NextResponse, type NextRequest } from 'next/server';

import {
  ACCESS_TOKEN_COOKIE,
  DEFAULT_ACCESS_MAX_AGE_SECONDS,
  DEFAULT_REFRESH_MAX_AGE_SECONDS,
  REFRESH_TOKEN_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth/cookies';
import { secondsUntilExpiry } from '@/lib/auth/jwt';
import { getAccountApiUrl } from '@/lib/service-urls';

/**
 * Two jobs, both of which have to happen before a page renders:
 *
 * 1. Silent refresh. The access-token cookie expires after 15 minutes; the
 *    refresh-token cookie lives for 7 days. When the short-lived cookie is gone but
 *    the long-lived one is still present we rotate here, in the middleware, because
 *    this is one of the few places Next.js allows cookies to be written. Rotating
 *    during a Server Component render would burn the single-use refresh token
 *    without being able to store its replacement.
 *
 * 2. Route guarding. /profile is only reachable with a session; everyone else is
 *    bounced to /login?next=... so they land back where they were headed.
 *
 * Note this is a *cookie presence* check, not an authorisation decision. The real
 * check is the JWT signature verification done by account-service on every call.
 */

const PROTECTED_PREFIXES = ['/profile'];
const GUEST_ONLY_PATHS = ['/login', '/register'];
const REFRESH_TIMEOUT_MS = 5_000;
/**
 * How long a finished rotation keeps answering on behalf of the token it replaced.
 * Long enough to cover the requests that were already in flight carrying the old
 * cookie, short enough that a genuinely stolen token is rejected almost immediately.
 */
const ROTATION_MEMO_MS = 10_000;
/** Hard cap so a flood of distinct tokens cannot grow the map without bound. */
const ROTATION_MEMO_MAX_ENTRIES = 500;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * "The service said no" and "the service did not answer" are different facts, and
 * only the first one means the session is over. Conflating them turns a ten-second
 * account-service restart into a mass logout, because the cookies get deleted while
 * the refresh token is still perfectly valid.
 */
type RotationOutcome =
  { status: 'rotated'; pair: TokenPair } | { status: 'rejected' } | { status: 'unavailable' };

interface RotationMemo {
  /** Never rejects: requestRotation turns every failure into an outcome. */
  result: Promise<RotationOutcome>;
  settledAt: number | null;
}

/**
 * SINGLE-FLIGHT REFRESH - the reason this map exists.
 *
 * A refresh token is single-use: account-service rotates it and treats a second
 * presentation of the same token as theft, revoking every session that user has. But
 * a single navigation produces several requests that reach this middleware within
 * milliseconds (the document plus the <Link> prefetches in the header), and two open
 * tabs do the same. Once the access cookie has expired each of them would POST the
 * *same* refresh token: the first wins, the rest are read as a replay, and the whole
 * family - including the pair just handed to the browser - is revoked. The symptom is
 * a random silent sign-out on every device, triggered by ordinary prefetching.
 *
 * So rotation is memoised by the token being spent. Concurrent callers share one
 * in-flight POST, and a straggler still carrying the old cookie is answered with the
 * replacement pair for a few seconds instead of replaying a spent token.
 *
 * Per-process state is the right scope for a single frontend container, and it is
 * best-effort by design: with several replicas the same race can still happen between
 * them, so the durable fix belongs in account-service (claim the row atomically with a
 * conditional update, and answer a rotation replayed inside a short grace window with
 * the pair that replaced it rather than revoking the family).
 */
const rotations = new Map<string, RotationMemo>();

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Drop memos that have outlived the grace window, then enforce the size cap. */
function pruneRotations(now: number): void {
  for (const [token, memo] of rotations) {
    if (memo.settledAt !== null && now - memo.settledAt > ROTATION_MEMO_MS) {
      rotations.delete(token);
    }
  }
  // Map iterates in insertion order, so this evicts the oldest entries first.
  let excess = rotations.size - ROTATION_MEMO_MAX_ENTRIES;
  for (const token of rotations.keys()) {
    if (excess <= 0) {
      break;
    }
    rotations.delete(token);
    excess -= 1;
  }
}

async function requestRotation(refreshToken: string): Promise<RotationOutcome> {
  try {
    const response = await fetch(`${getAccountApiUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
    if (!response.ok) {
      // 4xx is a verdict on the token (expired, revoked, replayed); 5xx is the
      // service failing, which says nothing about the session.
      return response.status < 500 ? { status: 'rejected' } : { status: 'unavailable' };
    }
    const body: unknown = await response.json();
    const pair = body as Partial<TokenPair> | null;
    if (typeof pair?.accessToken !== 'string' || typeof pair.refreshToken !== 'string') {
      return { status: 'unavailable' };
    }
    return {
      status: 'rotated',
      pair: { accessToken: pair.accessToken, refreshToken: pair.refreshToken },
    };
  } catch {
    // Unreachable or timed out. Render this request as signed out, but keep the
    // cookies: the very next request may well succeed.
    return { status: 'unavailable' };
  }
}

/** Rotate a refresh token at most once, sharing the outcome with concurrent callers. */
function rotate(refreshToken: string): Promise<RotationOutcome> {
  pruneRotations(Date.now());

  const memoised = rotations.get(refreshToken);
  if (memoised) {
    return memoised.result;
  }

  const memo: RotationMemo = { result: requestRotation(refreshToken), settledAt: null };
  rotations.set(refreshToken, memo);
  const forget = () => {
    if (rotations.get(refreshToken) === memo) {
      rotations.delete(refreshToken);
    }
  };
  // The rejection handler is unreachable in practice - requestRotation catches
  // everything - but attaching one keeps a surprise from becoming an unhandled
  // rejection in the Edge runtime.
  void memo.result.then((outcome) => {
    if (outcome.status === 'unavailable') {
      // Nothing was spent, so there is nothing to protect: forget it immediately and
      // let the next request try again rather than serving a cached failure for the
      // whole grace window.
      forget();
      return;
    }
    memo.settledAt = Date.now();
  }, forget);
  return memo.result;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  let accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  let rotated: TokenPair | null = null;
  let sessionEnded = false;

  if (!accessToken && refreshToken) {
    const outcome = await rotate(refreshToken);
    if (outcome.status === 'rotated') {
      rotated = outcome.pair;
      accessToken = rotated.accessToken;
      // Mutating the request cookies makes the fresh token visible to the render
      // that this same request is about to trigger.
      request.cookies.set(ACCESS_TOKEN_COOKIE, rotated.accessToken);
      request.cookies.set(REFRESH_TOKEN_COOKIE, rotated.refreshToken);
    } else if (outcome.status === 'rejected') {
      sessionEnded = true;
      request.cookies.delete(REFRESH_TOKEN_COOKIE);
    }
    // 'unavailable' falls through: no session for this render, but the cookies stay
    // so the visitor is still signed in once account-service answers again.
  }

  const isAuthenticated = Boolean(accessToken);
  // A /login?next=... request is never bounced back, even for a visitor who still
  // looks signed in: that combination means a page has just decided the session is
  // unusable, and sending them to /profile again would be an infinite redirect loop.
  const isGuestOnly =
    GUEST_ONLY_PATHS.includes(pathname) && !request.nextUrl.searchParams.has('next');

  let response: NextResponse;
  if (!isAuthenticated && isProtected(pathname)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    response = NextResponse.redirect(loginUrl);
  } else if (isAuthenticated && isGuestOnly) {
    response = NextResponse.redirect(new URL('/profile', request.url));
  } else {
    response = NextResponse.next({ request });
  }

  if (rotated) {
    response.cookies.set(
      ACCESS_TOKEN_COOKIE,
      rotated.accessToken,
      sessionCookieOptions(secondsUntilExpiry(rotated.accessToken, DEFAULT_ACCESS_MAX_AGE_SECONDS)),
    );
    response.cookies.set(
      REFRESH_TOKEN_COOKIE,
      rotated.refreshToken,
      sessionCookieOptions(
        secondsUntilExpiry(rotated.refreshToken, DEFAULT_REFRESH_MAX_AGE_SECONDS),
      ),
    );
  } else if (sessionEnded) {
    // The refresh token was expired, revoked or already rotated - drop the dead cookies.
    response.cookies.delete(ACCESS_TOKEN_COOKIE);
    response.cookies.delete(REFRESH_TOKEN_COOKIE);
  }

  return response;
}

export const config = {
  // Skip Next internals, static assets and the container healthcheck: none of them
  // need a session, and /health in particular must stay clear of all token work so a
  // liveness probe can never reach account-service.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|health).*)'],
};
