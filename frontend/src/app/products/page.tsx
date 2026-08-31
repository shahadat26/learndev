import type { Metadata } from 'next';

import { Alert } from '@/components/alert';
import { CategoryFilter } from '@/components/category-filter';
import { Pagination } from '@/components/pagination';
import { ProductGrid } from '@/components/product-grid';
import { SearchInput } from '@/components/search-input';
import { productApi } from '@/lib/api/products';
import { normaliseProductSort, PRODUCT_SORT_OPTIONS, selectedSortValue } from '@/lib/product-sort';
import { firstParam, positiveInt, uuidParam, type SearchParams } from '@/lib/url';

export const metadata: Metadata = {
  title: 'Products',
  description: 'Browse the catalogue served by product-service.',
};

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 48;

interface ProductsPageProps {
  // In Next 15 searchParams is a promise: it is resolved per request.
  searchParams: Promise<SearchParams>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;

  const page = positiveInt(params.page, 1, 10_000);
  const limit = positiveInt(params.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const search = firstParam(params.search);
  // Both are validated before they are forwarded: product-service answers 400 on a
  // non-UUID categoryId or an unknown sort value, and a bad URL should degrade to an
  // unfiltered listing rather than blow the page up.
  const categoryId = uuidParam(params.categoryId);
  const sort = normaliseProductSort(firstParam(params.sort));

  const [result, categories] = await Promise.all([
    // Letting this throw would hand the whole page to error.tsx and take the search box,
    // the category chips and the sort picker with it - the shopper could not even clear a
    // filter and retry. Degrading to an inline notice keeps the page usable, the same way
    // the landing page does. error.tsx stays the boundary for renders that genuinely
    // cannot proceed, such as /profile with account-service down.
    productApi.listProducts({ page, limit, search, categoryId, sort }).catch((error: unknown) => {
      console.error('[products] catalogue unavailable', error);
      return null;
    }),
    // A missing category list must not take the whole page down.
    productApi.listCategories().catch(() => []),
  ]);

  const failed = result === null;
  const products = result?.data ?? [];
  const meta = result?.meta ?? { page, limit, total: products.length, totalPages: 1 };
  const carriedParams = {
    search,
    categoryId,
    sort,
    limit: limit === DEFAULT_LIMIT ? undefined : limit,
  };

  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Products</h1>
        <p className="text-sm text-slate-600">
          {failed
            ? 'The catalogue could not be loaded.'
            : meta.total > 0
              ? `Showing ${from}-${to} of ${meta.total} product${meta.total === 1 ? '' : 's'}`
              : 'No products match your filters.'}
        </p>
      </header>

      {failed ? (
        <Alert variant="error">
          The product catalogue is unavailable right now. Check that product-service is running and
          healthy, then reload the page.
        </Alert>
      ) : null}

      <div className="space-y-4">
        <SearchInput
          defaultValue={search ?? ''}
          // `sort` is not hidden here - the picker below owns that field.
          hiddenParams={{
            categoryId,
            limit: limit === DEFAULT_LIMIT ? undefined : String(limit),
          }}
          sortOptions={PRODUCT_SORT_OPTIONS}
          sortValue={selectedSortValue(sort)}
        />
        <CategoryFilter
          categories={categories}
          activeCategoryId={categoryId}
          params={{ search, sort, limit: limit === DEFAULT_LIMIT ? undefined : limit }}
        />
      </div>

      {/* An empty grid saying "seed the database" would be wrong advice when the call failed,
          so the alert above stands in for the grid rather than sitting next to it. */}
      {failed ? null : (
        <>
          <ProductGrid
            products={products}
            emptyTitle={search ? `No results for "${search}"` : 'No products found'}
            emptyDescription={
              search
                ? 'Try a shorter search term, or clear the filters to see the whole catalogue.'
                : 'Seed the product-service database to populate the catalogue.'
            }
          />

          <Pagination page={meta.page} totalPages={meta.totalPages} params={carriedParams} />
        </>
      )}
    </div>
  );
}
