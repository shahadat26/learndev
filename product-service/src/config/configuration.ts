/**
 * Typed configuration factory (12-factor: config comes from the environment).
 *
 * This file and `validation.schema.ts` are the ONLY places in the service that
 * are allowed to read `process.env`. Everything else asks the ConfigService,
 * which means a missing variable is a startup crash with a clear message rather
 * than an `undefined` surfacing three layers deep at request time.
 */

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  logLevel: string;
  logPretty: boolean;
  corsOrigin: string[];
  database: {
    url: string;
  };
  jwt: {
    accessSecret: string;
  };
}

/** `CORS_ORIGIN` accepts a single origin or a comma separated list. */
const parseOrigins = (raw: string): string[] =>
  raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

/**
 * Every read has a `??` fallback rather than an `as string` cast. The Joi schema
 * already guarantees the variable is present, but a cast would turn a future
 * schema change (a dropped default, a renamed key) into `undefined` or `NaN`
 * leaking downstream; a fallback keeps the service on a sane value instead.
 * The defaults here are deliberately identical to the Joi defaults.
 */
export const configuration = (): AppConfig => {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: Number.parseInt(process.env.PRODUCT_SERVICE_PORT ?? '3007', 10),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    logPretty: process.env.LOG_PRETTY === 'true',
    corsOrigin: parseOrigins(process.env.CORS_ORIGIN ?? 'http://localhost'),
    database: {
      url: process.env.PRODUCT_DATABASE_URL ?? '',
    },
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    },
  };
};
