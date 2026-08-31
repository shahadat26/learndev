import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { throttlerOptions } from './common/throttling';
import { AppConfigModule } from './config/app-config.module';
import { type AppConfiguration } from './config/configuration';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfiguration, true>) => ({
        pinoHttp: {
          level: configService.get('logLevel', { infer: true }),

          // Structured JSON by default so a log shipper can parse every field.
          // Pretty output is opt-in for humans, and never installed in the
          // production image (pino-pretty is a devDependency).
          transport: configService.get('logPretty', { infer: true })
            ? {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
              }
            : undefined,

          // Correlation id: reuse the one the edge proxy sent if there is one,
          // otherwise mint it here. Every log line for a request carries it, so
          // a single id ties the frontend, Traefik and both services together.
          genReqId: (req, res): string => {
            const incoming = req.headers['x-request-id'];
            const id = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },

          // Secrets must never reach the log store: not the bearer token, not a
          // password, not a refresh token. Logs are usually far more widely
          // readable than the database.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              'req.body.password',
              'req.body.refreshToken',
              'password',
              '*.password',
              'accessToken',
              '*.accessToken',
              'refreshToken',
              '*.refreshToken',
              'tokenHash',
              '*.tokenHash',
            ],
            censor: '[REDACTED]',
          },

          autoLogging: {
            // Probes fire every few seconds; logging them buries real traffic.
            ignore: (req) => req.url === '/health' || req.url === '/health/ready',
          },

          customProps: () => ({ service: 'account-service' }),
        },
      }),
    }),
    // Rate limiting, configured in common/throttling.ts. Registered here rather
    // than at the edge because the services are directly reachable on the
    // compose network - a limit that only exists in Traefik protects nothing
    // once something inside the network can talk to port 3001.
    ThrottlerModule.forRoot(throttlerOptions),
    PrismaModule,
    AuthModule,
    UsersModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    // Order matters, and it is the order they are listed in: shed abusive
    // traffic before spending bcrypt or a database round trip on it, then
    // authenticate, then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
