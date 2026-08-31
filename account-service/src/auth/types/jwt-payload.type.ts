import { type Role } from '@prisma/client';

/**
 * Both token types carry an explicit `type` claim. Without it a refresh token
 * (long-lived, 7 days) would be accepted anywhere an access token is - so every
 * verifier in the system, including product-service, must check it.
 */

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  type: 'access';
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Unique id for this token, and the primary lookup key for its stored row. */
  jti: string;
  type: 'refresh';
  iat?: number;
  exp?: number;
}

export type TokenPayload = AccessTokenPayload | RefreshTokenPayload;
