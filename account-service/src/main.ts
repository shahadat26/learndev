import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { type AppConfiguration } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Hold early log lines until the pino logger is attached, so nothing that
    // happens during startup is printed in a different format.
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService<AppConfiguration, true>);
  const port = configService.get('port', { infer: true });
  const corsOrigin = configService.get('corsOrigin', { infer: true });
  const isProduction = configService.get('isProduction', { infer: true });

  // Requests arrive via Traefik, so the client IP and protocol are in
  // X-Forwarded-* headers. Trusting exactly one proxy hop keeps rate limiting
  // and logging honest without letting a client spoof its own address.
  app.set('trust proxy', 1);

  // Sensible security headers (HSTS, no-sniff, frameguard, ...).
  app.use(helmet());

  // An explicit allow-list, never a wildcard. `credentials: true` combined with
  // a reflected origin (what `origin: true` does) would let *any* site read
  // credentialed responses from /auth/*; the Joi schema rejects `*` outright so
  // the shortcut cannot be taken by accident. product-service parses the same
  // variable the same way.
  app.enableCors({
    origin: corsOrigin
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip anything not declared on the DTO...
      whitelist: true,
      // ...and reject the request outright if it tried, rather than silently
      // dropping fields the caller believed were applied.
      forbidNonWhitelisted: true,
      // Query/path params arrive as strings; turn them into the declared types.
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Lets Nest run onModuleDestroy hooks on SIGTERM, so Prisma closes its pool
  // before the container dies. Without this, `docker stop` severs connections.
  app.enableShutdownHooks();

  if (!isProduction) {
    // Swagger describes every route and its DTOs. Kept out of production
    // because an API catalogue is a gift to anyone probing the service.
    const documentConfig = new DocumentBuilder()
      .setTitle('Account Service')
      .setDescription(
        'Authentication, JWT issuance with refresh-token rotation, and user profiles. ' +
          'Behind Traefik these routes are reached under /api (the prefix is stripped before ' +
          'it reaches this service).',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        // Must match the name given to @ApiBearerAuth() on the controllers.
        'access-token',
      )
      .build();

    SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, documentConfig));
  }

  // 0.0.0.0, not localhost: a container-local bind would be unreachable from
  // anywhere else on the compose network.
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  // Nothing is wired up yet at this point, so use the console and exit non-zero
  // so Docker/Kubernetes sees a failed start instead of a silent zombie.
  console.error('account-service failed to start', error);
  process.exit(1);
});
