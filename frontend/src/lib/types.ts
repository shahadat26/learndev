/**
 * Mirrors of the JSON shapes returned by account-service and product-service.
 * These are hand written on purpose: the storefront is a separate deployable and
 * must not import types across service boundaries.
 */

export type Role = 'USER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** The paginated envelope is identical in both services. */
export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface Category {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Money is transported as `priceCents` (an integer) plus an ISO currency code.
 * Floating point is never used for money: 0.1 + 0.2 !== 0.3 in IEEE-754, and a
 * rounding error in a cart total is a real bug, not a cosmetic one.
 */
export interface Product {
  id: string;
  name: string;
  description?: string | null;
  priceCents: number;
  currency: string;
  sku?: string | null;
  stock?: number | null;
  imageUrl?: string | null;
  isActive?: boolean;
  categoryId?: string | null;
  category?: Category | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Error envelope produced by the shared AllExceptionsFilter in both services. */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  timestamp?: string;
  path?: string;
}

export interface ProductListQuery {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  sort?: string;
}
