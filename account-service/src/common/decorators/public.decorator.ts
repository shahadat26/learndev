import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opt a route out of the globally registered `JwtAuthGuard`.
 *
 * Authentication is deny-by-default: the guard is applied to every route in
 * AppModule and individual endpoints (login, register, health) mark themselves
 * public. Forgetting a decorator then fails closed, which is the safe direction.
 */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
