import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppConfig } from '../../config/configuration';
import { Role } from '../../common/enums/role.enum';
import { JwtAccessPayload } from '../../common/interfaces/jwt-payload.interface';
import { JwtStrategy } from './jwt.strategy';

const configService = {
  get: () => ({ accessSecret: 'test_access_secret_that_is_at_least_32_chars' }),
} as unknown as ConfigService<AppConfig, true>;

const accessPayload: JwtAccessPayload = {
  sub: 'user-1',
  email: 'admin@shop.local',
  role: Role.ADMIN,
  type: 'access',
};

describe('JwtStrategy', () => {
  const strategy = new JwtStrategy(configService);

  it('maps a valid access token payload onto request.user', () => {
    expect(strategy.validate(accessPayload)).toEqual({
      userId: 'user-1',
      email: 'admin@shop.local',
      role: Role.ADMIN,
    });
  });

  it('rejects a refresh token presented as a bearer token', () => {
    expect(() => strategy.validate({ ...accessPayload, type: 'refresh' })).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a payload with an unknown role claim', () => {
    expect(() => strategy.validate({ ...accessPayload, role: 'SUPERUSER' as Role })).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a payload missing the subject', () => {
    expect(() => strategy.validate({ ...accessPayload, sub: '' })).toThrow(UnauthorizedException);
  });
});
