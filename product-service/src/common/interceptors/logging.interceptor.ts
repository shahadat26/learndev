import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Per-handler timing at debug level.
 *
 * nestjs-pino already emits one structured line per HTTP request; this adds the
 * controller/handler that served it, which is what you actually want when a
 * latency alert fires and you need to know *which* handler got slow.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const handler = `${context.getClass().name}.${context.getHandler().name}`;
    const startedAt = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.log(handler, request, startedAt, 'ok'),
        error: () => this.log(handler, request, startedAt, 'error'),
      }),
    );
  }

  private log(handler: string, request: Request, startedAt: bigint, outcome: string): void {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    this.logger.debug(
      `${request.method} ${request.url} ${handler} ${outcome} ${durationMs.toFixed(1)}ms`,
    );
  }
}
