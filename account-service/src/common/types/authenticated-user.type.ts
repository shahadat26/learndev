import { type Role } from '@prisma/client';

/**
 * What `JwtStrategy.validate()` puts on `request.user`, and therefore what
 * `@CurrentUser()` hands to a controller. Deliberately small: it is derived
 * from the access token alone, with no database round trip per request.
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
}
