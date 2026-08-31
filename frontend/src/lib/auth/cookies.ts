/**
 * Cookie contract for the session, shared by the server components, the server
 * actions and the middleware. Kept free of Node-only APIs so the Edge middleware
 * can import it too.
 */

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** Fallbacks matching JWT_ACCESS_TTL=15m / JWT_REFRESH_TTL=7d from the root .env. */
export const DEFAULT_ACCESS_MAX_AGE_SECONDS = 15 * 60;
export const DEFAULT_REFRESH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  maxAge: number;
}

/**
 * httpOnly is the whole point: JavaScript in the browser cannot read these cookies,
 * so an XSS bug cannot exfiltrate the tokens. The browser never sees a JWT in a
 * response body either - every API call happens on the server.
 * sameSite=lax blocks the cookie on cross-site POSTs, which kills the obvious CSRF
 * vector; secure is enabled in production so the cookie is only sent over TLS
 * (it stays off in development because the lab runs on plain http://localhost).
 */
export function sessionCookieOptions(maxAge: number): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}
