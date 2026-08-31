import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { type AppConfiguration } from '../../config/configuration';
import { type AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { type AccessTokenPayload } from '../types/jwt-payload.type';

/**
 * Verifies access tokens locally with the shared HS256 secret - no database
 * lookup and no call to another service. product-service runs the identical
 * check with the identical secret, which is what lets it authorise requests
 * without ever talking to account-service.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService<AppConfiguration, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt', { infer: true }).accessSecret,
      // Pin the algorithm: without this a token could be presented with a
      // different `alg` header and change how the signature is checked. It also
      // keeps this verifier identical to the one in product-service and to the
      // `verifyOptions` on the JwtModule in auth.module.ts.
      algorithms: ['HS256'],
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    // Without this check a refresh token - valid for days rather than minutes -
    // would be accepted as an access token if the two secrets were ever aligned.
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    if (!payload.sub || !payload.email || !payload.role) {
      throw new UnauthorizedException('Malformed access token');
    }

    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
