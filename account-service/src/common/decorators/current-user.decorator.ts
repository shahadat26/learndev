import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { type AuthenticatedUser } from '../types/authenticated-user.type';

/**
 * Pull the authenticated principal off the request:
 *   `@CurrentUser() user: AuthenticatedUser`  -> the whole object
 *   `@CurrentUser('userId') id: string`       -> a single field
 */
export const CurrentUser = createParamDecorator(
  (
    property: keyof AuthenticatedUser | undefined,
    ctx: ExecutionContext,
  ): AuthenticatedUser | AuthenticatedUser[keyof AuthenticatedUser] | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      return undefined;
    }

    return property ? user[property] : user;
  },
);
