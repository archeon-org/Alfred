import { describe, expect, it, vi } from 'vitest';

import type { DatabaseHealthIndicator } from '../../src/modules/health/database-health.indicator';
import { HealthService } from '../../src/modules/health/health.service';
import type { RedisHealthIndicator } from '../../src/modules/health/redis-health.indicator';

const unusedRedis = {} as RedisHealthIndicator;

describe('HealthService', () => {
  it('exposes a non-sensitive process health summary', () => {
    const service = new HealthService({} as DatabaseHealthIndicator, unusedRedis);

    expect(service.getHealth()).toMatchObject({ service: 'alfred-api', status: 'ok' });
  });

  it('keeps liveness independent from PostgreSQL', async () => {
    const databaseCheck = vi.fn();
    const database = { check: databaseCheck } as unknown as DatabaseHealthIndicator;
    const service = new HealthService(database, unusedRedis);

    await expect(service.checkLiveness()).resolves.toEqual({ status: 'ok' });
    expect(databaseCheck).not.toHaveBeenCalled();
  });

  it('registers PostgreSQL as a readiness dependency', async () => {
    const databaseCheck = vi.fn().mockResolvedValue({ database: { status: 'up' } });
    const database = { check: databaseCheck } as unknown as DatabaseHealthIndicator;
    const redisCheck = vi.fn().mockResolvedValue({ redis: { status: 'up' } });
    const redis = { check: redisCheck } as unknown as RedisHealthIndicator;
    const service = new HealthService(database, redis);

    await expect(service.checkReadiness()).resolves.toEqual({
      details: { database: { status: 'up' }, redis: { status: 'up' } },
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
    const service = new HealthService(database, redis);

    await expect(service.checkReadiness()).rejects.toThrow(/Service Unavailable/u);
  });
});
