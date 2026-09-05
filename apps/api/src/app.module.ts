import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { APP_FILTER } from '@nestjs/core';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { AlfredThrottlerGuard } from './common/guards/alfred-throttler.guard';
import { AccessTokenGuard } from './common/guards/access-token.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { validateEnv } from './config/configuration';
import { createTypeOrmOptions } from './database/typeorm.options';
import { RedisModule } from './infrastructure/redis/redis.module';
import { RedisThrottlerStorage } from './infrastructure/redis/redis-throttler.storage';
import { AuthModule } from './modules/auth/auth.module';
import { FeatureFlagGuard } from './modules/feature-flags/feature-flag.guard';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { HealthModule } from './modules/health/health.module';
import { PlatformModule } from './modules/platform/platform.module';
import { StreamModule } from './modules/stream/stream.module';
import { UsersModule } from './modules/users/users.module';
import { HttpObservabilityInterceptor } from './observability/http-observability.interceptor';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    RedisModule,
    ObservabilityModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        storage,
        throttlers: [{ limit: 120, ttl: 60_000 }],
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createTypeOrmOptions,
    }),
    FeatureFlagsModule,
    AuthModule,
    HealthModule,
    PlatformModule,
    StreamModule,
    UsersModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: FeatureFlagGuard },
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: AlfredThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: HttpObservabilityInterceptor },
  ],
})
export class AppModule {}
