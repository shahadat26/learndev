import { Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Readiness check for account_db: issues the cheapest possible query and
 * reports up/down. `SELECT 1` touches no table, so it stays fast and cannot be
 * skewed by application data.
 */
@Injectable()
export class PrismaHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : 'Database is unreachable',
      });
    }
  }
}
