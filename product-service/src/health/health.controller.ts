import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../common/decorators/public.decorator';
import { SKIP_ALL_THROTTLERS } from '../common/throttling';
import { PrismaHealthIndicator } from './prisma.health';

/**
 * Two distinct probes, because they answer two different questions:
 *
 *  - /health       (liveness)  "is the process alive?"  -> never touches the DB,
 *    so a database blip cannot make an orchestrator kill and restart a perfectly
 *    healthy container.
 *  - /health/ready (readiness) "can it serve traffic?"   -> pings the DB, so the
 *    instance is pulled out of the load balancer while its dependency is down.
 *
 * Both are @Public(): a probe has no credentials.
 */
@ApiTags('health')
// Probes are exempt from rate limiting: compose, and later Kubernetes, poll
// these every few seconds from a single address, and a throttled probe would
// report the container unhealthy for the one reason restarting cannot fix.
@SkipThrottle(SKIP_ALL_THROTTLERS)
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe (no dependency checks)' })
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe (pings product_db)' })
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([() => this.prismaHealth.isHealthy('database')]);
  }
}
