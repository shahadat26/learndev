import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

/**
 * Registered globally (APP_GUARD), so every route requires a valid access token
 * unless it is explicitly marked `@Public()`. Deny-by-default: a new endpoint is
 * protected the moment it exists.
 *
 * `@Public()` means "do not reject anonymous callers", not "do not look at the
 * token". Passport still runs on a public route, so a valid bearer token puts the
 * principal on `request.user` where `@CurrentUser()` can read it - that is how
 * the public catalogue shows unpublished products to an ADMIN and to nobody
 * else. A missing, expired or malformed token on a public route simply leaves
 * the caller anonymous rather than returning 401.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override handleRequest<TUser = AuthenticatedUser>(
    err: Error | null,
    user: TUser | false | undefined,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    const isPublic =
      this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true;

    if (isPublic) {
      // Never throw on a public route: no token, a bad token and an expired
      // token all mean "anonymous". The cast is unavoidable because Passport's
      // `handleRequest` is declared to return `TUser`, while Nest's own
      // AuthGuard treats a falsy return as "leave request.user unset" - which
      // is precisely the anonymous case we want here.
      return (user === false ? undefined : user) as TUser;
    }

    return super.handleRequest<TUser>(err, user, info, context, status);
  }
}
