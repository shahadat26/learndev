import { Role } from '../enums/role.enum';

/** Access token payload as minted by account-service. */
export interface JwtAccessPayload {
  sub: string;
  email: string;
  role: Role;
  /** Discriminator: a refresh token must never be accepted as an access token. */
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

/**
 * What `JwtStrategy.validate()` attaches to `request.user`.
 *
 * The field is `userId`, not `id`, and matches account-service byte for byte:
 * the two services describe the same principal, so a reader diffing them should
 * not have to notice a rename. `userId` also reads unambiguously next to a
 * product `id` in the same handler.
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
}
