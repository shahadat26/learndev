import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import { AppConfig } from '../config/configuration';

/**
 * Thin wrapper turning PrismaClient into a Nest provider with a managed
 * lifecycle: connect on module init, disconnect on shutdown. Combined with
 * `app.enableShutdownHooks()` in main.ts this is what lets the container drain
 * cleanly on SIGTERM instead of dropping in-flight queries.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService<AppConfig, true>) {
    super({
      // The URL comes from the validated config, not straight from process.env.
      datasourceUrl: configService.get('database', { infer: true }).url,
      log: ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to product_db');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from product_db');
  }
}
