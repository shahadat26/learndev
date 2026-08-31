import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { configuration } from './configuration';
import { validationSchema } from './validation.schema';

/**
 * Global config module. `isGlobal: true` means every other module can inject
 * `ConfigService` without importing anything.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // In Docker the environment is injected by compose; locally it comes from
      // an (untracked) .env next to package.json.
      envFilePath: ['.env'],
      load: [configuration],
      validationSchema,
      validationOptions: {
        // Report every problem at once instead of one per restart.
        abortEarly: false,
        // Compose hands the container plenty of vars this service does not use.
        allowUnknown: true,
      },
    }),
  ],
})
export class AppConfigModule {}
