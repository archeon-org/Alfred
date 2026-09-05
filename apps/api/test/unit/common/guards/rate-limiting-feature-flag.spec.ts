import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { createThrottlerOptions } from '@api/app.module';
import {
  AuthenticatedThrottlerGuard,
  IpThrottlerGuard,
  OauthCallbackThrottlerGuard,
  OauthStartThrottlerGuard,
  RefreshThrottlerGuard,
} from '@api/common/guards/alfred-throttler.guard';
import type { RedisThrottlerStorage } from '@api/infrastructure/redis/redis-throttler.storage';
import type { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';

describe.each([
  IpThrottlerGuard,
  AuthenticatedThrottlerGuard,
  OauthStartThrottlerGuard,
  OauthCallbackThrottlerGuard,
  RefreshThrottlerGuard,
])('%s rate-limiting flag', (Guard) => {
  it.each([true, false])('enforces the configured mode when enabled=%s', async (enabled) => {
    const increment = vi.fn().mockResolvedValue({
      isBlocked: true,
      totalHits: 3,
      timeToExpire: 60,
      timeToBlockExpire: 60,
    });
    const storage = { increment } as unknown as RedisThrottlerStorage;
    const flags = { isEnabled: () => enabled } as unknown as FeatureFlagsService;
    const config = { getOrThrow: () => 2 } as unknown as ConfigService;
    const header = vi.fn();
    const context = {
      getClass: () => class Probe {},
      getHandler: () => function probe() {},
      switchToHttp: () => ({
        getRequest: () => ({ ip: '10.0.0.1', user: { id: 'user-a' }, headers: {} }),
        getResponse: () => ({ header }),
      }),
    } as unknown as ExecutionContext;
    const guard = new Guard(
      createThrottlerOptions(storage, config, flags),
      storage,
      new Reflector(),
    );
    await guard.onModuleInit();

    if (enabled) {
      await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 429 });
      expect(increment).toHaveBeenCalledOnce();
    } else {
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(increment).not.toHaveBeenCalled();
      expect(header).not.toHaveBeenCalled();
    }
  });
});
