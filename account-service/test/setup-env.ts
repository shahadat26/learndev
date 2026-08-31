/**
 * Jest `setupFiles` entry - runs before any test module is imported.
 *
 * ConfigModule.forRoot() validates the environment the moment app.module.ts is
 * imported, so these must be in place first. Everything here is fake: the whole
 * point of the suite is that it passes with no database and no secrets.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.LOG_PRETTY = 'false';

process.env.ACCOUNT_SERVICE_PORT = '3006';
process.env.ACCOUNT_DATABASE_URL =
  'postgresql://test:test@localhost:5432/account_test_db?schema=public';

process.env.JWT_ACCESS_SECRET = 'test_access_secret_that_is_long_enough_32';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_that_is_long_enough_32';
process.env.JWT_REFRESH_TTL = '7d';

// bcrypt is intentionally slow. Cost 4 keeps the suite fast while exercising
// exactly the same code path; production stays at 12.
process.env.BCRYPT_SALT_ROUNDS = '4';

process.env.CORS_ORIGIN = 'http://localhost';
