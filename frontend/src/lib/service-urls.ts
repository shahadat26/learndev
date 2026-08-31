/**
 * Base URLs of the two backend services.
 *
 * This module is deliberately free of `server-only` and of every Node-only API so
 * the Edge middleware can import it too - the same reason `lib/auth/cookies.ts` is
 * kept dependency-free. `lib/env.ts` re-exports it for ordinary server code, so the
 * fallback and the trailing-slash rule exist exactly once instead of being copied
 * into the middleware and drifting.
 *
 * The reads are written as literal `process.env.NAME` expressions on purpose: that
 * is the form Next.js can statically analyse for the Edge bundle, whereas a dynamic
 * `process.env[name]` lookup is not guaranteed to resolve there.
 */

/** Trim, fall back when unset, and strip a trailing slash so `${base}${path}` never doubles it. */
export function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.replace(/\/+$/, '');
}

/** account-service base URL. Compose DNS name in Docker, localhost outside it. */
export function getAccountApiUrl(): string {
  return normalizeBaseUrl(process.env.API_ACCOUNT_URL, 'http://localhost:3006');
}

/** product-service base URL. */
export function getProductApiUrl(): string {
  return normalizeBaseUrl(process.env.API_PRODUCT_URL, 'http://localhost:3007');
}
