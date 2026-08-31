import 'server-only';

import { apiFetch, type ApiRequest } from '@/lib/api/client';
import { getProductApiUrl } from '@/lib/env';
import type { Category, Paginated, Product, ProductListQuery } from '@/lib/types';

function request<T>(req: ApiRequest): Promise<T> {
  return apiFetch<T>(getProductApiUrl(), 'product-service', req);
}

/**
 * GET /categories is documented as returning a plain list. Accepting the paginated
 * envelope as well keeps the storefront working either way instead of throwing.
 */
function toCategoryList(payload: Category[] | Paginated<Category> | null): Category[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.data)) {
    return payload.data;
  }
  return [];
}

export const productApi = {
  listProducts(query: ProductListQuery = {}): Promise<Paginated<Product>> {
    return request<Paginated<Product>>({
      path: '/products',
      query: {
        page: query.page,
        limit: query.limit,
        search: query.search,
        categoryId: query.categoryId,
        sort: query.sort,
      },
      // A catalogue listing is public and identical for every visitor, so it may be
      // cached briefly. Anything authenticated or mutating uses cache: "no-store".
      revalidate: 60,
    });
  },

  getProduct(id: string): Promise<Product> {
    return request<Product>({ path: `/products/${encodeURIComponent(id)}`, revalidate: 60 });
  },

  async listCategories(): Promise<Category[]> {
    const payload = await request<Category[] | Paginated<Category>>({
      path: '/categories',
      revalidate: 300,
    });
    return toCategoryList(payload);
  },

  getCategory(id: string): Promise<Category> {
    return request<Category>({ path: `/categories/${encodeURIComponent(id)}`, revalidate: 300 });
  },
};
