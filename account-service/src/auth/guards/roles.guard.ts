import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Role } from '@prisma/client';

import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { type AuthenticatedUser } from '../../common/types/authenticated-user.type';

/**
 * Runs after JwtAuthGuard (guards execute in registration order), so
 * `request.user` is already populated by the time this is reached.
 *
 * Authentication answers "who are you", authorisation answers "may you" - hence
 * 403 here rather than 401.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles on the route: any authenticated caller is fine.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions for this resource');
    }

    return true;
  }
}
