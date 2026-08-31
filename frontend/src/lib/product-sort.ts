/**
 * Sort vocabulary for GET /products.
 *
 * product-service validates `sort` with an `@IsIn(...)` whitelist and rejects
 * anything else with a 400, so a hand-typed `?sort=cheapest` would take the whole
 * page down. The allowed values are mirrored here and every incoming value is
 * normalised before it is forwarded: unknown input is dropped, not proxied.
 *
 * Keep this list in step with PRODUCT_SORTABLE_FIELDS in
 * product-service/src/products/dto/query-products.dto.ts.
 */

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'name', 'priceCents', 'stock'] as const;

/** Every value product-service accepts - broader than what the picker offers. */
const ALLOWED_SORT_VALUES: ReadonlySet<string> = new Set(
  SORTABLE_FIELDS.flatMap((field) => [`${field}:asc`, `${field}:desc`]),
);

export interface ProductSortOption {
  /** Empty string means "leave `sort` out of the URL and take the service default". */
  value: string;
  label: string;
}

/**
 * The subset worth exposing in the UI. `updatedAt` and `stock` are valid on the
 * API but are not shopper-facing concepts, so they are reachable only by URL.
 */
export const PRODUCT_SORT_OPTIONS: readonly ProductSortOption[] = [
  { value: '', label: 'Newest first' },
  { value: 'name:asc', label: 'Name (A-Z)' },
  { value: 'name:desc', label: 'Name (Z-A)' },
  { value: 'priceCents:asc', label: 'Price (low to high)' },
  { value: 'priceCents:desc', label: 'Price (high to low)' },
];

/** Return the value only when product-service will accept it, otherwise undefined. */
export function normaliseProductSort(value: string | undefined): string | undefined {
  return value !== undefined && ALLOWED_SORT_VALUES.has(value) ? value : undefined;
}

/** The value the `<select>` should show for the current URL. */
export function selectedSortValue(sort: string | undefined): string {
  const normalised = normaliseProductSort(sort);
  return normalised !== undefined && PRODUCT_SORT_OPTIONS.some((o) => o.value === normalised)
    ? normalised
    : '';
}
