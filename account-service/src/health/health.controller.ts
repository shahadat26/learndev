import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, type HealthCheckResult } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../common/decorators/public.decorator';
import { SKIP_ALL_THROTTLERS } from '../common/throttling';
import { PrismaHealthIndicator } from './prisma.health';

/**
 * Two probes, because they answer different questions:
 *
 *  - /health       LIVENESS.  "Is this process still working?" It must not
 *                  touch the database: if Postgres blips, restarting the API
 *                  container fixes nothing and a liveness failure would put it
 *                  into a crash loop.
 *  - /health/ready READINESS. "Should this instance receive traffic?" Here the
 *                  database matters - without it every request would 500, so
 *                  the instance should be pulled from the load balancer until
 *                  the dependency recovers.
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
    private readonly prismaIndicator: PrismaHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe - process is up, no dependencies checked' })
  @ApiResponse({ status: 200, description: 'The process is alive' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe - dependencies are reachable' })
  @ApiResponse({ status: 200, description: 'Ready to serve traffic' })
  @ApiResponse({ status: 503, description: 'A dependency is unavailable' })
  ready(): Promise<HealthCheckResult> {
    return this.health.check([() => this.prismaIndicator.isHealthy('database')]);
  }
}
