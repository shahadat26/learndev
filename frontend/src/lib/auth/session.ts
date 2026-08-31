import 'server-only';

import { cookies } from 'next/headers';
import { cache } from 'react';

import { accountApi } from '@/lib/api/account';
import { isApiError } from '@/lib/api/client';
import {
  ACCESS_TOKEN_COOKIE,
  DEFAULT_ACCESS_MAX_AGE_SECONDS,
  DEFAULT_REFRESH_MAX_AGE_SECONDS,
  REFRESH_TOKEN_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth/cookies';
import { secondsUntilExpiry } from '@/lib/auth/jwt';
import type { AuthTokens, User } from '@/lib/types';

/**
 * Session handling for the storefront.
 *
 * The tokens live in httpOnly cookies and are only ever read on the server. The
 * browser receives HTML, never a JWT.
 *
 * IMPORTANT Next.js constraint: cookies can only be *written* from a Server Action,
 * a Route Handler or the middleware - never while rendering a Server Component.
 * That is why rendering never rotates the refresh token: the refresh token is
 * single-use, so rotating it without being able to persist the replacement would
 * log the user out on their next request.
 */

/** Raised when the session is gone and the caller should send the user to /login. */
export class SessionExpiredError extends Error {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export interface SessionTokens {
  accessToken?: string;
  refreshToken?: string;
}

export async function getSessionTokens(): Promise<SessionTokens> {
  const store = await cookies();
  return {
    accessToken: store.get(ACCESS_TOKEN_COOKIE)?.value,
    refreshToken: store.get(REFRESH_TOKEN_COOKIE)?.value,
  };
}

/** Write the token pair. Server Actions and Route Handlers only. */
export async function setSessionCookies(tokens: AuthTokens): Promise<void> {
  const store = await cookies();
  store.set(
    ACCESS_TOKEN_COOKIE,
    tokens.accessToken,
    sessionCookieOptions(secondsUntilExpiry(tokens.accessToken, DEFAULT_ACCESS_MAX_AGE_SECONDS)),
  );
  store.set(
    REFRESH_TOKEN_COOKIE,
    tokens.refreshToken,
    sessionCookieOptions(secondsUntilExpiry(tokens.refreshToken, DEFAULT_REFRESH_MAX_AGE_SECONDS)),
  );
}

/** Remove the token pair. Server Actions and Route Handlers only. */
export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_TOKEN_COOKIE);
  store.delete(REFRESH_TOKEN_COOKIE);
}

/**
 * Exchange the refresh token for a fresh pair and persist it.
 * Returns null when the refresh token was rejected (expired, revoked, or already
 * rotated - the account-service refuses a reused token by design).
 */
export async function rotateSession(refreshToken: string): Promise<AuthTokens | null> {
  try {
    const tokens = await accountApi.refresh(refreshToken);
    await setSessionCookies(tokens);
    return tokens;
  } catch (error) {
    if (isApiError(error) && (error.isUnauthorized || error.isForbidden)) {
      await clearSessionCookies();
      return null;
    }
    throw error;
  }
}

/**
 * Refresh-on-401 helper for authenticated mutations.
 *
 * Runs `call` with the current access token; if the service answers 401 it rotates
 * the refresh token once and retries. Only safe inside a Server Action or Route
 * Handler, because rotation writes cookies.
 */
export async function withAccessToken<T>(call: (accessToken: string) => Promise<T>): Promise<T> {
  const { accessToken, refreshToken } = await getSessionTokens();

  if (accessToken) {
    try {
      return await call(accessToken);
    } catch (error) {
      if (!isApiError(error) || !error.isUnauthorized) {
        throw error;
      }
    }
  }

  if (!refreshToken) {
    await clearSessionCookies();
    throw new SessionExpiredError();
  }

  const rotated = await rotateSession(refreshToken);
  if (!rotated) {
    throw new SessionExpiredError();
  }

  return call(rotated.accessToken);
}

/**
 * Why this is a three-state result and not a `User | null`.
 *
 * "Nobody is signed in" and "account-service could not answer" are different facts
 * and callers need to tell them apart. Collapsing both into null is how a page ends
 * up redirecting a perfectly valid session to /login while the middleware - which
 * only looks at cookie presence - redirects it straight back, producing an infinite
 * /profile -> /login -> /profile loop the moment account-service is restarted.
 */
export type SessionState =
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User }
  | { status: 'unavailable'; error: Error };

/**
 * Load the session once per request. Safe to call while rendering: it only reads
 * cookies. Wrapped in React `cache` so the layout header and the page share one API
 * call - and one log line - per request.
 */
export const loadSession = cache(async (): Promise<SessionState> => {
  const { accessToken } = await getSessionTokens();
  if (!accessToken) {
    return { status: 'anonymous' };
  }

  try {
    return { status: 'authenticated', user: await accountApi.getProfile(accessToken) };
  } catch (error) {
    if (isApiError(error) && (error.isUnauthorized || error.isForbidden)) {
      // The middleware refreshes an expired access token before the render runs,
      // so reaching here means the session is genuinely unusable.
      return { status: 'anonymous' };
    }
    // account-service down or too slow: the session is unknown, not absent.
    console.error('[session] failed to load the current user', error);
    return {
      status: 'unavailable',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
});

/**
 * The signed-in user, or null.
 *
 * Deliberately lenient: an unreachable account-service renders as signed out, which
 * is what the shared header and the public pages want - a storefront should not 500
 * because the profile service is down. Anything that must not confuse "signed out"
 * with "cannot tell" (the /profile page) uses `loadSession()` instead.
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await loadSession();
  return session.status === 'authenticated' ? session.user : null;
}
