import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { type AppConfiguration } from '../config/configuration';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      // Defaults are the access-token settings; the refresh token is signed with
      // an explicit secret/expiry override in AuthService, so the two key
      // materials never get mixed up by accident.
      useFactory: (configService: ConfigService<AppConfiguration, true>) => {
        const jwt = configService.get('jwt', { infer: true });
        return {
          secret: jwt.accessSecret,
          signOptions: { expiresIn: jwt.accessTtl, algorithm: 'HS256' as const },
          verifyOptions: { algorithms: ['HS256' as const] },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // JwtStrategy is exported so the globally registered JwtAuthGuard resolves.
  exports: [AuthService, PassportModule, JwtModule],
})
export class AuthModule {}
