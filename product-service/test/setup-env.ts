/**
 * Jest `setupFiles` entry - runs BEFORE any test module is imported.
 *
 * The ConfigModule validates the environment the moment AppModule is loaded, so
 * these values have to exist before the first `import`. Nothing here points at a
 * real service: the whole suite runs offline with Prisma mocked.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.PRODUCT_SERVICE_PORT = '3007';
process.env.PRODUCT_DATABASE_URL =
  'postgresql://test:test@localhost:5432/product_test_db?schema=public';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_that_is_at_least_32_chars';
process.env.CORS_ORIGIN = 'http://localhost';
