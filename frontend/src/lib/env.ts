import 'server-only';

/**
 * Environment access for server code (12-factor: config lives in the environment,
 * never in the code). Values are read lazily on every call so a container restart
 * with a new value takes effect without a rebuild - unlike NEXT_PUBLIC_* variables,
 * which are inlined into the browser bundle at build time.
 *
 * This is not the *only* module that touches `process.env`: it imports `server-only`,
 * so the Edge middleware cannot use it. The two service URLs therefore live in
 * `lib/service-urls.ts`, which both this module and `middleware.ts` import, and
 * `lib/auth/cookies.ts` reads NODE_ENV for the same reason. Those three modules are
 * the whole list - application code reads configuration through them, never directly.
 */

import { normalizeBaseUrl } from '@/lib/service-urls';

export { getAccountApiUrl, getProductApiUrl } from '@/lib/service-urls';

/** Public origin of the storefront, used for absolute metadata URLs. */
export function getSiteUrl(): string {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL, 'http://localhost:3005');
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
