import Link from 'next/link';

interface SortOption {
  value: string;
  label: string;
}

interface SearchInputProps {
  defaultValue?: string;
  /** Filters to preserve across a new search, rendered as hidden inputs. */
  hiddenParams?: Record<string, string | undefined>;
  action?: string;
  /** Values for the `sort` picker. Omit (or pass an empty list) to hide it. */
  sortOptions?: readonly SortOption[];
  /** Currently selected sort value; `''` selects the service default. */
  sortValue?: string;
}

/**
 * A plain GET form, deliberately not a client component: the browser turns it into
 * `/products?search=...&sort=...` on its own, the result is a shareable URL, and it
 * still works with JavaScript disabled. Submitting always returns to page 1, which
 * is why `page` is never carried over.
 */
export function SearchInput({
  defaultValue = '',
  hiddenParams,
  action = '/products',
  sortOptions = [],
  sortValue = '',
}: SearchInputProps) {
  const hidden = Object.entries(hiddenParams ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
  );
  const canSort = sortOptions.length > 0;

  return (
    <form action={action} method="get" role="search" className="flex flex-wrap items-end gap-2">
      {hidden.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div className="min-w-56 flex-1">
        <label htmlFor="product-search" className="label">
          Search products
        </label>
        <input
          id="product-search"
          type="search"
          name="search"
          defaultValue={defaultValue}
          placeholder="e.g. keyboard"
          className="input mt-1.5"
        />
      </div>

      {canSort ? (
        <div className="min-w-48">
          <label htmlFor="product-sort" className="label">
            Sort by
          </label>
          {/* No onChange handler: this stays a server component, so the picker is
              applied by the same submit button as the search box. */}
          <select id="product-sort" name="sort" defaultValue={sortValue} className="input mt-1.5">
            {sortOptions.map((option) => (
              <option key={option.value || 'default'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <button type="submit" className="btn-primary">
        Apply
      </button>

      {defaultValue || sortValue ? (
        <Link href={action} className="btn-ghost">
          Clear
        </Link>
      ) : null}
    </form>
  );
}
