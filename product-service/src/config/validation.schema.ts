import * as Joi from 'joi';

/**
 * Fail-fast environment validation.
 *
 * The container should refuse to start (and therefore fail its healthcheck /
 * rolling update) when configuration is wrong, instead of booting into a
 * half-configured state that only breaks under traffic.
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  // Pretty printing is an explicit opt-in, never inferred from NODE_ENV: the
  // whole stack must emit one parseable JSON stream unless a human asks
  // otherwise. account-service uses the same flag.
  LOG_PRETTY: Joi.boolean().truthy('true').falsy('false').default(false),

  PRODUCT_SERVICE_PORT: Joi.number().port().default(3007),

  PRODUCT_DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  // Shared with account-service. Anything shorter than 32 chars is too weak for HS256.
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),

  CORS_ORIGIN: Joi.string().default('http://localhost'),
})
  // Compose injects the whole root .env into the container, so unrelated keys
  // (POSTGRES_*, JWT_REFRESH_*, ...) must be tolerated rather than rejected.
  .unknown(true);
