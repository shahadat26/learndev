/**
 * URL helpers shared by the pages, the server actions and the middleware.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

/** Next.js gives repeated query keys as arrays; the storefront always wants the first value. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function positiveInt(
  value: string | string[] | undefined,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = Number.parseInt(firstParam(value) ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Accept a query parameter only when it is a UUID.
 *
 * The services validate ids with `@IsUUID()` and answer 400 on anything else, so a
 * hand-typed `?categoryId=shoes` would throw the whole page into error.tsx. Dropping
 * the bad value degrades to "unfiltered" instead.
 */
export function uuidParam(value: string | string[] | undefined): string | undefined {
  const candidate = firstParam(value);
  return candidate !== undefined && UUID_PATTERN.test(candidate) ? candidate : undefined;
}

/** Build `/path?a=1&b=2`, dropping empty values so URLs stay clean. */
export function buildUrl(pathname: string, params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

/**
 * SECURITY: `?next=` comes from the URL, so it is attacker controlled. Only same-site
 * absolute paths are accepted - anything else (`//evil.example`, `https://evil.example`,
 * a backslash trick) is an open-redirect and is replaced by a safe default.
 */
export function safeRedirectPath(candidate: string | undefined | null, fallback = '/'): string {
  if (!candidate) {
    return fallback;
  }
  const value = candidate.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return fallback;
  }
  return value;
}
