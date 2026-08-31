import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '@prisma/client';

// The envelope lives in a DTO class rather than a local interface, so the very
// shape this filter emits is the one Swagger documents on every error response.
import { ErrorResponseDto } from '../dto/error-response.dto';

/** Shape Nest uses for the body of an HttpException built from an object. */
interface HttpExceptionBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

/**
 * Turns every thrown value into one predictable JSON shape.
 *
 * Two operational rules are encoded here:
 *  - clients get a stable contract, never a stack trace or a driver message;
 *  - 5xx is logged at `error` with the stack (someone must look at it), 4xx at
 *    `warn` (usually the caller's fault, still worth counting in dashboards).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  /** Widened to `number` so it can be compared against arbitrary status codes. */
  private static readonly SERVER_ERROR_FLOOR: number = HttpStatus.INTERNAL_SERVER_ERROR;

  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ url?: string; originalUrl?: string; method?: string }>();

    const { statusCode, message, error } = this.describe(exception);

    const body: ErrorResponseDto = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url ?? '',
    };

    const logContext = `${request.method ?? 'UNKNOWN'} ${body.path} -> ${statusCode}`;

    if (statusCode >= AllExceptionsFilter.SERVER_ERROR_FLOOR) {
      this.logger.error(
        logContext,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${logContext} ${JSON.stringify(message)}`);
    }

    httpAdapter.reply(ctx.getResponse(), body, statusCode);
  }

  private describe(exception: unknown): {
    statusCode: number;
    message: string | string[];
    error: string;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        return { statusCode, message: response, error: this.reasonPhrase(statusCode) };
      }

      const responseBody = response as HttpExceptionBody;
      return {
        statusCode,
        // class-validator failures arrive here as a string[] of messages, which
        // the contract says to pass through untouched.
        message: responseBody.message ?? exception.message,
        error: responseBody.error ?? this.reasonPhrase(statusCode),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.describePrismaError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid query parameters',
        error: this.reasonPhrase(HttpStatus.BAD_REQUEST),
      };
    }

    // Anything unrecognised is a bug in this service. Log the detail, tell the
    // caller nothing - internal messages are an information-disclosure risk.
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: this.reasonPhrase(HttpStatus.INTERNAL_SERVER_ERROR),
    };
  }

  private describePrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    message: string;
    error: string;
  } {
    switch (exception.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'A record with these details already exists',
          error: this.reasonPhrase(HttpStatus.CONFLICT),
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Resource not found',
          error: this.reasonPhrase(HttpStatus.NOT_FOUND),
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Related record does not exist',
          error: this.reasonPhrase(HttpStatus.BAD_REQUEST),
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          error: this.reasonPhrase(HttpStatus.INTERNAL_SERVER_ERROR),
        };
    }
  }

  /** `404 -> "Not Found"`, using Nest's own status enum as the source of truth. */
  private reasonPhrase(statusCode: number): string {
    const key = HttpStatus[statusCode] as string | undefined;

    if (!key) {
      return 'Error';
    }

    return key
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
