import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  // bufferLogs keeps the very first startup lines until the pino logger is ready.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  const logger = app.get(Logger);
  app.useLogger(logger);
  app.flushLogs();

  const configService = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const nodeEnv = configService.get('nodeEnv', { infer: true });
  const isProduction = configService.get('isProduction', { infer: true });
  const port = configService.get('port', { infer: true });

  // Exactly one proxy hop (Traefik) sits in front of this service, so trust one
  // level of X-Forwarded-*. Without it Express reports Traefik's container IP as
  // the client address in every log line. `1`, never `true`: blindly trusting the
  // whole chain lets a caller forge the header. account-service does the same.
  app.set('trust proxy', 1);

  // Sensible security headers (CSP, HSTS, no-sniff, frameguard...).
  app.use(helmet());

  app.enableCors({
    origin: configService.get('corsOrigin', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // whitelist strips unknown properties, forbidNonWhitelisted turns them
      // into a 400: a typo in a client payload fails loudly instead of silently.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Lets Nest run onModuleDestroy (Prisma $disconnect) on SIGTERM, which is how
  // `docker stop` and a Kubernetes rolling update ask a pod to go away.
  app.enableShutdownHooks();

  if (!isProduction) {
    // Swagger is dev-only: an API schema is a map of the attack surface.
    const documentConfig = new DocumentBuilder()
      .setTitle('Product Service')
      .setDescription(
        'Product catalogue for the DevOps learning lab. Behind Traefik every path ' +
          'below is prefixed with /api (the proxy strips it before forwarding).',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token issued by account-service',
        },
        'access-token',
      )
      .addTag('products')
      .addTag('categories')
      .addTag('health')
      .build();

    const document = SwaggerModule.createDocument(app, documentConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // 0.0.0.0, not localhost: a container that binds the loopback interface is
  // unreachable from the compose network.
  await app.listen(port, '0.0.0.0');

  logger.log(`product-service listening on http://0.0.0.0:${port} (NODE_ENV=${nodeEnv})`);
  if (!isProduction) {
    logger.log(`Swagger UI available at http://localhost:${port}/docs`);
  }
}

bootstrap().catch((error: unknown) => {
  // The logger may not exist yet at this point, so fall back to the console.
  console.error('product-service failed to start', error);
  process.exit(1);
});
