import 'server-only';

import type { ApiErrorBody } from '@/lib/types';

/**
 * Thin fetch wrapper shared by every server-side call to the microservices.
 * It is imported with `server-only`, so accidentally pulling it into a
 * "use client" module is a build error rather than a runtime data leak.
 */

export class ApiError extends Error {
  readonly status: number;
  /** class-validator messages, when the service returned a 400 with a message array. */
  readonly details: string[];

  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export type QueryValue = string | number | boolean | undefined | null;

export interface ApiRequest {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Bearer access token. Any request carrying one is never cached. */
  token?: string;
  /** Seconds of shared cache for anonymous GETs. `false` disables caching. */
  revalidate?: number | false;
}

/** A page render must never hang on a wedged upstream service. */
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_REVALIDATE_SECONDS = 60;

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function messageFromBody(body: unknown, fallback: string): { message: string; details: string[] } {
  const envelope = body as ApiErrorBody | null;
  if (envelope && Array.isArray(envelope.message)) {
    const details = envelope.message.filter((entry): entry is string => typeof entry === 'string');
    return { message: details.join(', ') || fallback, details };
  }
  if (envelope && typeof envelope.message === 'string' && envelope.message.length > 0) {
    return { message: envelope.message, details: [] };
  }
  return { message: fallback, details: [] };
}

export async function apiFetch<T>(
  baseUrl: string,
  serviceName: string,
  request: ApiRequest,
): Promise<T> {
  const method = request.method ?? 'GET';
  const isMutation = method !== 'GET';
  const isAuthenticated = Boolean(request.token);

  const headers: Record<string, string> = { accept: 'application/json' };
  if (request.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (request.token) {
    headers.authorization = `Bearer ${request.token}`;
  }

  const init: RequestInit = {
    method,
    headers,
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };

  if (isMutation || isAuthenticated || request.revalidate === false) {
    // Per-user or state-changing responses must never land in a shared cache.
    init.cache = 'no-store';
  } else {
    init.next = { revalidate: request.revalidate ?? DEFAULT_REVALIDATE_SECONDS };
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(baseUrl, request.path, request.query), init);
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
    throw new ApiError(
      503,
      timedOut
        ? `${serviceName} did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`
        : `${serviceName} is unreachable`,
    );
  }

  if (response.status === 204) {
    // No content: callers type these as Promise<void>.
    return undefined as T;
  }

  const text = await response.text();
  const body = text.length > 0 ? parseJson(text) : null;

  if (!response.ok) {
    const { message, details } = messageFromBody(
      body,
      `${serviceName} responded with ${response.status}`,
    );
    throw new ApiError(response.status, message, details);
  }

  return body as T;
}
