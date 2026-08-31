import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { AuthenticatedUser } from '../interfaces/jwt-payload.interface';

/**
 * Pull the authenticated principal off the request:
 *   `@CurrentUser() user: AuthenticatedUser | undefined`  -> the whole object
 *   `@CurrentUser('role') role: Role | undefined`         -> a single field
 *
 * Same signature as account-service's decorator. It returns `undefined` on a
 * `@Public()` route reached without a token, which is exactly how the catalogue
 * endpoints tell an anonymous visitor from a signed-in ADMIN.
 */
export const CurrentUser = createParamDecorator(
  (
    property: keyof AuthenticatedUser | undefined,
    ctx: ExecutionContext,
  ): AuthenticatedUser | AuthenticatedUser[keyof AuthenticatedUser] | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      return undefined;
    }

    return property ? user[property] : user;
  },
);
