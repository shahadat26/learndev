import 'server-only';

import { isApiError } from '@/lib/api/client';

/**
 * Turn any thrown value into a message that is safe to show in a form.
 *
 * Upstream 4xx messages are surfaced verbatim because they are written for users
 * (class-validator output, "Email already registered", ...). Anything 5xx is
 * replaced with a generic sentence: internal failure detail belongs in the logs,
 * not in the browser.
 */
export function describeApiError(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    if (error.status === 503) {
      return 'The service is temporarily unavailable. Please try again in a moment.';
    }
    if (error.status >= 500) {
      console.error('[api] upstream failure', error);
      return 'Something went wrong on our side. Please try again.';
    }
    return error.message || fallback;
  }
  console.error('[api] unexpected failure', error);
  return fallback;
}
