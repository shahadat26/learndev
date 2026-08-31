import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CategoriesModule } from './categories/categories.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { throttlerOptions } from './common/throttling';
import { AppConfigModule } from './config/app-config.module';
import { AppConfig } from './config/configuration';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';

const HEALTH_PATHS = new Set(['/health', '/health/ready']);

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        return {
          pinoHttp: {
            level: configService.get('logLevel', { infer: true }),
            // Structured JSON by default, one object per line, so a shipper can
            // index every field. Pretty output is an explicit opt-in via
            // LOG_PRETTY - never inferred from NODE_ENV, or the base compose
            // stack (NODE_ENV=development) would emit unparseable text from this
            // service while account-service emitted JSON. pino-pretty is a
            // devDependency, so it is not even installed in the shipped image.
            transport: configService.get('logPretty', { infer: true })
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
                }
              : undefined,
            // Secrets must never reach the log store: once written they are
            // replicated, backed up and searchable by everyone with log access.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
                'req.body.password',
                'req.body.passwordHash',
                '*.password',
                '*.passwordHash',
              ],
              censor: '[REDACTED]',
            },
            // Correlation id: honour an incoming one (so a request can be traced
            // across Traefik -> frontend -> this service) and echo it back.
            genReqId: (req: IncomingMessage, res: ServerResponse): string => {
              const header = req.headers['x-request-id'];
              const incoming = Array.isArray(header) ? header[0] : header;
              const id = incoming && incoming.length > 0 ? incoming : randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            customProps: () => ({ service: 'product-service' }),
            // Probes fire every few seconds; logging them buries real traffic.
            autoLogging: {
              ignore: (req: IncomingMessage) => HEALTH_PATHS.has(req.url ?? ''),
            },
          },
        };
      },
    }),
    // Rate limiting, configured in common/throttling.ts. Registered here rather
    // than only at the edge because the services are directly reachable on the
    // compose network - a limit that exists solely in Traefik protects nothing
    // once something inside the network can talk to port 3002.
    ThrottlerModule.forRoot(throttlerOptions),
    PrismaModule,
    AuthModule,
    ProductsModule,
    CategoriesModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    // Order matters, and it is the order they are listed in: shed abusive
    // traffic before spending a database round trip on it, then authenticate,
    // then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
