import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AppConfig } from '../../config/configuration';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser, JwtAccessPayload } from '../../common/interfaces/jwt-payload.interface';

/**
 * Stateless, local-only token verification.
 *
 * product-service never calls account-service to check a token: it verifies the
 * HS256 signature with the shared JWT_ACCESS_SECRET. That keeps the request path
 * free of a synchronous cross-service dependency (account-service being down
 * must not take the catalogue down), at the cost of an access token staying
 * valid until it expires - hence the short JWT_ACCESS_TTL.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService<AppConfig, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt', { infer: true }).accessSecret,
      // Pin the algorithm: without this a token could be presented with a
      // different `alg` header and change how the signature is checked.
      algorithms: ['HS256'],
    });
  }

  validate(payload: JwtAccessPayload): AuthenticatedUser {
    // A refresh token is signed with a different secret, but the type claim is
    // checked anyway so the two token families can never be confused.
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    if (!payload.sub || !payload.email || !payload.role) {
      throw new UnauthorizedException('Malformed token payload');
    }

    if (payload.role !== Role.USER && payload.role !== Role.ADMIN) {
      throw new UnauthorizedException('Unknown role claim');
    }

    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
