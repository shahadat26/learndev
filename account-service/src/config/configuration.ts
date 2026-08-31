import { type ConfigService } from '@nestjs/config';
import { type JwtSignOptions } from '@nestjs/jwt';

/**
 * The single place in this service where `process.env` is read.
 *
 * Twelve-factor config: everything environment-specific arrives as an env var,
 * gets validated once at boot (see validation.schema.ts), and is then consumed
 * through a typed `ConfigService` everywhere else. Nothing downstream needs to
 * know whether a value came from a .env file, docker compose, or a Kubernetes
 * Secret.
 */

/**
 * What `jsonwebtoken` accepts for `expiresIn`: a millisecond count, or an `ms`
 * duration string such as "15m" / "7d". Deriving it from the library keeps our
 * config honest instead of widening it to `string`.
 */
export type TokenTtl = NonNullable<JwtSignOptions['expiresIn']>;

export interface JwtConfiguration {
  accessSecret: string;
  accessTtl: TokenTtl;
  refreshSecret: string;
  refreshTtl: TokenTtl;
}

export interface AppConfiguration {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  logLevel: string;
  logPretty: boolean;
  corsOrigin: string;
  databaseUrl: string;
  bcryptSaltRounds: number;
  jwt: JwtConfiguration;
}

export const configuration = (): AppConfiguration => {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppConfiguration['nodeEnv'];

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: Number.parseInt(process.env.ACCOUNT_SERVICE_PORT ?? '3006', 10),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    logPretty: process.env.LOG_PRETTY === 'true',
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost',
    databaseUrl: process.env.ACCOUNT_DATABASE_URL ?? '',
    bcryptSaltRounds: Number.parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10),
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
      // The casts are safe because validation.schema.ts rejects any TTL that is
      // not an `ms` duration ("15m", "7d") or a bare number of seconds, so the
      // process cannot reach this line with a value jsonwebtoken would refuse.
      accessTtl: (process.env.JWT_ACCESS_TTL ?? '15m') as TokenTtl,
      refreshTtl: (process.env.JWT_REFRESH_TTL ?? '7d') as TokenTtl,
    },
  };
};

/**
 * Inject this instead of the bare `ConfigService` so `get()` is fully typed and
 * never returns `undefined` (the Joi schema guarantees every key exists).
 */
export type TypedConfigService = ConfigService<AppConfiguration, true>;
