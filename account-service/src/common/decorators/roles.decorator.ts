import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import { type Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route to the given roles, e.g. `@Roles(Role.ADMIN)`.
 * Enforced by `RolesGuard`, which runs after `JwtAuthGuard`.
 */
export const Roles = (...roles: Role[]): CustomDecorator<string> => SetMetadata(ROLES_KEY, roles);
