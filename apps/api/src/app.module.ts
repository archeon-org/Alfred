import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import {
  AuthenticatedThrottlerGuard,
  IpThrottlerGuard,
} from './common/guards/alfred-throttler.guard';
import { AccessTokenGuard } from './common/guards/access-token.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { validateEnv } from './config/configuration';
import { createTypeOrmOptions } from './database/typeorm.options';
import { RedisModule } from './infrastructure/redis/redis.module';
import { RedisThrottlerStorage } from './infrastructure/redis/redis-throttler.storage';
import { AuthModule } from './modules/auth/auth.module';
import { FeatureFlagGuard } from './modules/feature-flags/feature-flag.guard';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { FeatureFlagsService } from './modules/feature-flags/feature-flags.service';
import { HealthModule } from './modules/health/health.module';
import { PlatformModule } from './modules/platform/platform.module';
import { StreamModule } from './modules/stream/stream.module';
import { UsersModule } from './modules/users/users.module';
import { ObservabilityModule } from './observability/observability.module';

const THROTTLE_WINDOW_MS = 60_000;

export function createThrottlerOptions(
  storage: RedisThrottlerStorage,
  config: ConfigService,
  featureFlags: FeatureFlagsService,
) {
  const rateLimitingEnabled = featureFlags.isEnabled('rateLimiting');
  return {
    skipIf: () => !rateLimitingEnabled,
    storage,
    throttlers: [
      {
        limit: config.getOrThrow<number>('AUTH_IP_RATE_LIMIT_PER_MINUTE'),
        name: 'ip',
        ttl: THROTTLE_WINDOW_MS,
      },
      {
        limit: config.getOrThrow<number>('AUTH_USER_RATE_LIMIT_PER_MINUTE'),
        name: 'authenticated',
        ttl: THROTTLE_WINDOW_MS,
      },
      {
        limit: config.getOrThrow<number>('AUTH_OAUTH_START_IP_RATE_LIMIT_PER_MINUTE'),
        name: 'oauth-start-ip',
        ttl: THROTTLE_WINDOW_MS,
      },
      {
        limit: config.getOrThrow<number>('AUTH_OAUTH_CALLBACK_IP_RATE_LIMIT_PER_MINUTE'),
        name: 'oauth-callback-ip',
        ttl: THROTTLE_WINDOW_MS,
      },
      {
        limit: config.getOrThrow<number>('AUTH_REFRESH_IP_RATE_LIMIT_PER_MINUTE'),
        name: 'refresh-ip',
        ttl: THROTTLE_WINDOW_MS,
      },
    ],
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    RedisModule,
    ObservabilityModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule, FeatureFlagsModule],
      inject: [RedisThrottlerStorage, ConfigService, FeatureFlagsService],
      useFactory: createThrottlerOptions,
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
    { provide: APP_GUARD, useClass: IpThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: AuthenticatedThrottlerGuard },
  ],
})
export class AppModule {}
