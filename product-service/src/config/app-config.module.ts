import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { configuration } from './configuration';
import { validationSchema } from './validation.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema,
      validationOptions: {
        // Report every problem at once instead of one variable per restart.
        abortEarly: false,
      },
      // In Docker the environment is injected by compose; locally a .env file is
      // convenient. `ignoreEnvFile` is never set, so both paths work.
      envFilePath: ['.env'],
    }),
  ],
})
export class AppConfigModule {}
