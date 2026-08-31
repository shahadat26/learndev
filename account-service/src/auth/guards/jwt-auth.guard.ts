import { Injectable, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { type Observable } from 'rxjs';

import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

/**
 * Registered globally in AppModule, so every route requires a valid access
 * token unless it is explicitly marked `@Public()`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  override handleRequest<TUser = unknown>(err: unknown, user: unknown): TUser {
    if (err || !user) {
      // Surface a genuine error (e.g. one thrown by JwtStrategy.validate) as-is,
      // otherwise fall back to a deliberately vague 401: expired, malformed and
      // absent tokens must all look identical to the caller.
      if (err instanceof Error) {
        throw err;
      }
      throw new UnauthorizedException('Invalid or missing access token');
    }

    return user as TUser;
  }
}
