import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opt a route out of the globally registered JwtAuthGuard.
 *
 * Authentication is deny-by-default (the guard is registered as APP_GUARD), so
 * forgetting a decorator locks an endpoint down instead of opening it up.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
