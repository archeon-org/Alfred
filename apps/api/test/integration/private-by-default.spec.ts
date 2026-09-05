import type { ClassProvider, Provider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { AppModule, createThrottlerOptions } from '../../src/app.module';
import {
  AuthenticatedThrottlerGuard,
  IpThrottlerGuard,
} from '../../src/common/guards/alfred-throttler.guard';
import { AccessTokenGuard } from '../../src/common/guards/access-token.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { FeatureFlagGuard } from '../../src/modules/feature-flags/feature-flag.guard';
import { FeatureFlagsController } from '../../src/modules/feature-flags/feature-flags.controller';
import { IS_PUBLIC_KEY } from '../../src/common/decorators/public.decorator';
import { HealthController } from '../../src/modules/health/health.controller';
import { PlatformController } from '../../src/modules/platform/platform.controller';
import type { RedisThrottlerStorage } from '../../src/infrastructure/redis/redis-throttler.storage';

function appProviders(): readonly Provider[] {
  return Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) as readonly Provider[];
}

function appGuards(): readonly ClassProvider[] {
  return appProviders().filter(
    (provider): provider is ClassProvider =>
      typeof provider === 'object' && provider !== null && provider.provide === APP_GUARD,
  );
}

describe('private-by-default application policy', () => {
  it('registers the exact pre-authentication and per-user guard order', () => {
    expect(appGuards()).toEqual([
      { provide: APP_GUARD, useClass: FeatureFlagGuard },
      { provide: APP_GUARD, useClass: IpThrottlerGuard },
      { provide: APP_GUARD, useClass: AccessTokenGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_GUARD, useClass: AuthenticatedThrottlerGuard },
    ]);
  });

  it('uses a higher shared-IP ceiling than the authenticated-user ceiling', () => {
    const storage = {} as RedisThrottlerStorage;
    const values: Readonly<Record<string, number>> = {
      AUTH_IP_RATE_LIMIT_PER_MINUTE: 6000,
      AUTH_OAUTH_CALLBACK_IP_RATE_LIMIT_PER_MINUTE: 600,
      AUTH_OAUTH_START_IP_RATE_LIMIT_PER_MINUTE: 300,
      AUTH_REFRESH_IP_RATE_LIMIT_PER_MINUTE: 1200,
      AUTH_USER_RATE_LIMIT_PER_MINUTE: 120,
    };
    const config = {
      getOrThrow: (key: string) => values[key],
    } as ConfigService;

    expect(createThrottlerOptions(storage, config)).toEqual({
      storage,
      throttlers: [
        { limit: 6000, name: 'ip', ttl: 60_000 },
        { limit: 120, name: 'authenticated', ttl: 60_000 },
        { limit: 300, name: 'oauth-start-ip', ttl: 60_000 },
        { limit: 600, name: 'oauth-callback-ip', ttl: 60_000 },
        { limit: 1200, name: 'refresh-ip', ttl: 60_000 },
      ],
    });
  });

  it('keeps operational health explicitly public while feature routes stay protected', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, FeatureFlagsController)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PlatformController)).toBeUndefined();
  });
});
