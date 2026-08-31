import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration, validateEnv } from './config/configuration';
import { HealthModule } from './modules/health/health.module';
import { PlatformModule } from './modules/platform/platform.module';
import { PrismaModule } from './modules/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    PlatformModule,
  ],
})
export class AppModule {}
