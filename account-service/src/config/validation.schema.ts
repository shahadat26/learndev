import * as Joi from 'joi';

/**
 * Fail fast. A container that boots with a missing or malformed secret and only
 * falls over on the first login is far worse to operate than one that refuses
 * to start at all - the orchestrator sees the crash immediately and the bad
 * rollout never receives traffic.
 */
/**
 * An `ms` duration ("15m", "7d", "900s") or a bare number of seconds. Enforcing
 * the format here is what makes the corresponding cast in configuration.ts safe.
 */
const TTL_PATTERN = /^\d+(ms|s|m|h|d|w|y)?$/;

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),

  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  LOG_PRETTY: Joi.boolean().truthy('true').falsy('false').default(false),

  ACCOUNT_SERVICE_PORT: Joi.number().port().default(3006),

  ACCOUNT_DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),

  // 32 chars is the minimum sensible length for an HS256 secret: the HMAC key
  // should be at least as long as the hash output it protects.
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().pattern(TTL_PATTERN).default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_TTL: Joi.string().pattern(TTL_PATTERN).default('7d'),

  BCRYPT_SALT_ROUNDS: Joi.number().integer().min(4).max(15).default(12),

  // A comma-separated list of absolute origins. `*` is deliberately rejected:
  // main.ts sends `Access-Control-Allow-Credentials: true`, and a wildcard (or
  // an origin reflected back to the caller) together with credentials lets any
  // website read authenticated responses. Failing at boot beats discovering it
  // in a pen test.
  CORS_ORIGIN: Joi.string()
    .pattern(/^https?:\/\/[^,\s*]+(,\s*https?:\/\/[^,\s*]+)*$/)
    .default('http://localhost')
    .messages({
      'string.pattern.base':
        'CORS_ORIGIN must be a comma-separated list of absolute http(s) origins; "*" is not allowed because credentials are enabled',
    }),
});
