import { describe, expect, it, vi } from 'vitest';

import type { DatabaseHealthIndicator } from '@api/modules/health/database-health.indicator';
import type { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import type { ContentStoreLifecycle } from '@api/modules/files/infrastructure/storage/content-store.lifecycle';
import { HealthService } from '@api/modules/health/health.service';
import type { RedisHealthIndicator } from '@api/modules/health/redis-health.indicator';

const unusedRedis = {} as RedisHealthIndicator;
const fileStorageOff = {
  check: () => Promise.resolve({}),
} as unknown as ContentStoreLifecycle;
const enabledFlags = {
  isEnabled: (feature: string) => feature === 'rateLimiting',
} as unknown as FeatureFlagsService;

describe('HealthService', () => {
  it('is not ready while the enabled file storage cannot be reached', async () => {
    const database = {
      check: () => Promise.resolve({ database: { status: 'up' } }),
    } as unknown as DatabaseHealthIndicator;
    const redis = {
      check: () => Promise.resolve({ redis: { status: 'up' } }),
    } as unknown as RedisHealthIndicator;
    const storageDown = {
      check: () => Promise.resolve({ storage: { status: 'down' as const } }),
    } as unknown as ContentStoreLifecycle;

    await expect(
      new HealthService(database, redis, enabledFlags, storageDown).checkReadiness(),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('exposes a non-sensitive process health summary', () => {
    const service = new HealthService(
      {} as DatabaseHealthIndicator,
      unusedRedis,
      enabledFlags,
      fileStorageOff,
    );

    expect(service.getHealth()).toMatchObject({ service: 'alfred-api', status: 'ok' });
  });

  it('keeps liveness independent from PostgreSQL', async () => {
    const databaseCheck = vi.fn();
    const database = { check: databaseCheck } as unknown as DatabaseHealthIndicator;
    const service = new HealthService(database, unusedRedis, enabledFlags, fileStorageOff);

    await expect(service.checkLiveness()).resolves.toEqual({ status: 'ok' });
    expect(databaseCheck).not.toHaveBeenCalled();
  });

  it('registers PostgreSQL as a readiness dependency', async () => {
    const databaseCheck = vi.fn().mockResolvedValue({ database: { status: 'up' } });
    const database = { check: databaseCheck } as unknown as DatabaseHealthIndicator;
    const redisCheck = vi.fn().mockResolvedValue({ redis: { status: 'up' } });
    const redis = { check: redisCheck } as unknown as RedisHealthIndicator;
    const service = new HealthService(database, redis, enabledFlags, fileStorageOff);

    await expect(service.checkReadiness()).resolves.toEqual({
      details: {
        database: { status: 'up' },
        redis: { status: 'up' },
      },
      status: 'ok',
    });
    expect(databaseCheck).toHaveBeenCalledOnce();
    expect(redisCheck).toHaveBeenCalledOnce();
  });

  it('fails readiness when Redis is unavailable', async () => {
    const database = {
      check: vi.fn().mockResolvedValue({ database: { status: 'up' } }),
    } as unknown as DatabaseHealthIndicator;
    const redis = {
      check: vi.fn().mockResolvedValue({ redis: { status: 'down' } }),
    } as unknown as RedisHealthIndicator;
    const service = new HealthService(database, redis, enabledFlags, fileStorageOff);

    await expect(service.checkReadiness()).rejects.toThrow(/Service Unavailable/u);
  });

  it('skips Redis readiness when rate limiting is disabled', async () => {
    const database = {
      check: vi.fn().mockResolvedValue({ database: { status: 'up' } }),
    } as unknown as DatabaseHealthIndicator;
    const redisCheck = vi.fn();
    const redis = { check: redisCheck } as unknown as RedisHealthIndicator;
    const disabledFlags = {
      isEnabled: vi.fn().mockReturnValue(false),
    } as unknown as FeatureFlagsService;
    const service = new HealthService(database, redis, disabledFlags, fileStorageOff);

    await expect(service.checkReadiness()).resolves.toEqual({
      details: {
        database: { status: 'up' },
        redis: { status: 'disabled' },
      },
      status: 'ok',
    });
    expect(redisCheck).not.toHaveBeenCalled();
  });
});
