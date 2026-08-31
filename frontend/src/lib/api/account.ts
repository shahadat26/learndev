import 'server-only';

import { apiFetch, type ApiRequest } from '@/lib/api/client';
import { getAccountApiUrl } from '@/lib/env';
import type { AuthResponse, AuthTokens, Paginated, User } from '@/lib/types';

/**
 * account-service client. Paths carry no `/api` prefix: Traefik strips it before
 * forwarding, and server-side we talk to the service directly anyway.
 */
function request<T>(req: ApiRequest): Promise<T> {
  return apiFetch<T>(getAccountApiUrl(), 'account-service', req);
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
}

export const accountApi = {
  register(input: RegisterInput): Promise<AuthResponse> {
    return request<AuthResponse>({ path: '/auth/register', method: 'POST', body: input });
  },

  login(input: LoginInput): Promise<AuthResponse> {
    return request<AuthResponse>({ path: '/auth/login', method: 'POST', body: input });
  },

  /** The service rotates the refresh token, so the response always replaces both tokens. */
  refresh(refreshToken: string): Promise<AuthTokens> {
    return request<AuthTokens>({ path: '/auth/refresh', method: 'POST', body: { refreshToken } });
  },

  logout(refreshToken: string): Promise<void> {
    return request<void>({ path: '/auth/logout', method: 'POST', body: { refreshToken } });
  },

  getProfile(accessToken: string): Promise<User> {
    return request<User>({ path: '/users/profile', token: accessToken });
  },

  updateProfile(accessToken: string, input: UpdateProfileInput): Promise<User> {
    return request<User>({
      path: '/users/profile',
      method: 'PATCH',
      body: input,
      token: accessToken,
    });
  },

  /** ADMIN only - exposed for completeness, the storefront does not render it. */
  listUsers(accessToken: string, page = 1, limit = 20): Promise<Paginated<User>> {
    return request<Paginated<User>>({ path: '/users', query: { page, limit }, token: accessToken });
  },
};
