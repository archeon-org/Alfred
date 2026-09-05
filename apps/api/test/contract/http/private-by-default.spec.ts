import type { ClassProvider, Provider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { AppModule, createThrottlerOptions } from '@api/app.module';
import {
  AuthenticatedThrottlerGuard,
  IpThrottlerGuard,
} from '@api/common/guards/alfred-throttler.guard';
import { AccessTokenGuard } from '@api/common/guards/access-token.guard';
import { RolesGuard } from '@api/common/guards/roles.guard';
import { IS_PUBLIC_KEY } from '@api/common/decorators/public.decorator';
import type { RedisThrottlerStorage } from '@api/infrastructure/redis/redis-throttler.storage';
import { FeatureFlagGuard } from '@api/modules/feature-flags/feature-flag.guard';
import { FeatureFlagsController } from '@api/modules/feature-flags/feature-flags.controller';
import type { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import { HealthController } from '@api/modules/health/health.controller';
import { PlatformController } from '@api/modules/platform/platform.controller';

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
    const featureFlags = {
      isEnabled: (feature: string) => feature === 'rateLimiting',
    } as unknown as FeatureFlagsService;
    const values: Readonly<Record<string, number>> = {
      AUTH_IP_RATE_LIMIT_PER_MINUTE: 6000,
      AUTH_OAUTH_CALLBACK_IP_RATE_LIMIT_PER_MINUTE: 600,
      AUTH_OAUTH_START_IP_RATE_LIMIT_PER_MINUTE: 300,
      AUTH_REFRESH_IP_RATE_LIMIT_PER_MINUTE: 1200,
      AUTH_USER_RATE_LIMIT_PER_MINUTE: 120,
    };
    const config = {
      getOrThrow: <T = unknown>(key: string): T => values[key] as T,
    } as ConfigService;

    const options = createThrottlerOptions(storage, config, featureFlags);

    expect(options.skipIf()).toBe(false);
    expect(options.storage).toBe(storage);
    expect(options.throttlers).toEqual([
      { limit: 6000, name: 'ip', ttl: 60_000 },
      { limit: 120, name: 'authenticated', ttl: 60_000 },
      { limit: 300, name: 'oauth-start-ip', ttl: 60_000 },
      { limit: 600, name: 'oauth-callback-ip', ttl: 60_000 },
      { limit: 1200, name: 'refresh-ip', ttl: 60_000 },
    ]);
  });

  it('uses one common skip predicate for every throttler when rate limiting is disabled', () => {
    const storage = {} as RedisThrottlerStorage;
    const config = {
      getOrThrow: () => 120,
    } as unknown as ConfigService;
    const isEnabled = vi.fn().mockReturnValue(false);
    const featureFlags = { isEnabled } as unknown as FeatureFlagsService;
    const options = createThrottlerOptions(storage, config, featureFlags) as ReturnType<
      typeof createThrottlerOptions
    > & { readonly skipIf: () => boolean };

    expect(options.skipIf()).toBe(true);
    expect(isEnabled).toHaveBeenCalledWith('rateLimiting');
  });

  it('keeps operational health explicitly public while feature routes stay protected', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, FeatureFlagsController)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PlatformController)).toBeUndefined();
  });
});
