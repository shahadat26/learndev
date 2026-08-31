import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Per-handler timing, logged at `debug`.
 *
 * nestjs-pino already emits one structured line per HTTP request; this adds the
 * controller/handler that served it and how long the handler itself took, which
 * is what you want when a p99 latency alert fires and you need to know *which*
 * handler is slow. It stays at debug level so it costs nothing in production
 * until you raise LOG_LEVEL.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const handler = `${context.getClass().name}.${context.getHandler().name}`;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.logger.debug(`${handler} completed in ${Date.now() - startedAt}ms`),
        error: () => this.logger.debug(`${handler} failed after ${Date.now() - startedAt}ms`),
      }),
    );
  }
}
