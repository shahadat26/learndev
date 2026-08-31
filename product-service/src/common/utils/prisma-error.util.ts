import { Prisma } from '@prisma/client';

/**
 * Narrow an `unknown` catch binding to a specific Prisma error code.
 * Codes: https://www.prisma.io/docs/orm/reference/error-reference
 */
export const isPrismaKnownError = (
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

/** The column(s) that blew a unique constraint, for a useful 409 message. */
export const uniqueConstraintFields = (error: Prisma.PrismaClientKnownRequestError): string => {
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.join(', ');
  }
  return typeof target === 'string' ? target : 'field';
};
