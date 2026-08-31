import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import { type AppConfiguration } from '../config/configuration';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService<AppConfiguration, true>) {
    super({
      // The URL comes from validated config rather than Prisma's implicit
      // process.env lookup, so a bad value is caught at boot by Joi.
      datasourceUrl: configService.get('databaseUrl', { infer: true }),
      log: [
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    // Connect eagerly so a broken database URL surfaces during startup, while
    // the readiness probe is still failing, instead of on the first request.
    await this.$connect();
    this.logger.log('Connected to account_db');
  }

  async onModuleDestroy(): Promise<void> {
    // Paired with app.enableShutdownHooks(): on SIGTERM the pool is drained
    // before the process exits, so no query is cut off mid-flight.
    await this.$disconnect();
    this.logger.log('Disconnected from account_db');
  }
}
