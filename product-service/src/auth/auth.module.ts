import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Verification only.
 *
 * There is deliberately no AuthService, no user table and no HTTP client here:
 * issuing, refreshing and revoking tokens is account-service's job. This module
 * exists so the catalogue can trust a bearer token offline.
 *
 * JwtAuthGuard and RolesGuard are deliberately NOT provided here: `app.module.ts`
 * registers both through `APP_GUARD`, which builds its own instances in the root
 * injector. Listing them again in this module would create a second, unused set
 * and leave a reader with two plausible answers to "where do the guards come
 * from". `APP_GUARD` is the single registration point.
 */
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt', session: false })],
  providers: [JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
