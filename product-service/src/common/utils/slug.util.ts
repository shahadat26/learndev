/**
 * URL-safe slug from a human name: "Wireless Mouse (Pro)" -> "wireless-mouse-pro".
 *
 * Deliberately ASCII-only and dependency-free. Slugs are unique in the database,
 * so a collision surfaces as a 409 rather than being silently disambiguated -
 * the caller can always pass an explicit `slug`.
 */
export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
