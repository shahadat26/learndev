import { STATUS_CODES } from 'node:http';

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';

import { ErrorResponseDto } from '../dto/error-response.dto';
import { uniqueConstraintFields } from '../utils/prisma-error.util';

/** Widened to `number` so comparing it with a raw HTTP status is not an enum comparison. */
const SERVER_ERROR_FLOOR: number = HttpStatus.INTERNAL_SERVER_ERROR;

/**
 * One error shape for the whole service:
 *   { statusCode, message, error, timestamp, path }
 *
 * A single filter means clients never have to guess, and it guarantees that an
 * unexpected exception is logged with its stack while still returning a generic
 * body - internal details (SQL, file paths) must not leak to the caller.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();

    const { statusCode, message, error } = this.describe(exception);

    const body: ErrorResponseDto = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request?.url ?? 'unknown',
    };

    // 5xx is our bug and needs the stack; 4xx is the caller's problem and is
    // only worth a warn, otherwise dashboards drown in noise.
    const context = `${request?.method ?? '-'} ${body.path}`;
    if (statusCode >= SERVER_ERROR_FLOOR) {
      this.logger.error(
        `${context} -> ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${context} -> ${statusCode} ${JSON.stringify(message)}`);
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
        return { statusCode, message: response, error: this.reason(statusCode) };
      }

      const payload = response as { message?: string | string[]; error?: string };
      return {
        statusCode,
        // ValidationPipe puts the class-validator messages in `message` as an array.
        message: payload.message ?? exception.message,
        error: payload.error ?? this.reason(statusCode),
      };
    }

    // Defence in depth: services translate the Prisma errors they expect, this
    // catches the ones they did not so a unique-constraint clash is never a 500.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.describePrisma(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid query parameters',
        error: this.reason(HttpStatus.BAD_REQUEST),
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: this.reason(HttpStatus.INTERNAL_SERVER_ERROR),
    };
  }

  private describePrisma(exception: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    message: string | string[];
    error: string;
  } {
    switch (exception.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `A record with this ${uniqueConstraintFields(exception)} already exists`,
          error: this.reason(HttpStatus.CONFLICT),
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Related record does not exist',
          error: this.reason(HttpStatus.BAD_REQUEST),
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: this.reason(HttpStatus.NOT_FOUND),
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          error: this.reason(HttpStatus.INTERNAL_SERVER_ERROR),
        };
    }
  }

  private reason(statusCode: number): string {
    return STATUS_CODES[statusCode] ?? 'Error';
  }
}
