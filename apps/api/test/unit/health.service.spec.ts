import type { HealthCheckService } from '@nestjs/terminus';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseHealthIndicator } from '../../src/modules/health/database-health.indicator';
import { HealthService } from '../../src/modules/health/health.service';

describe('HealthService', () => {
  it('keeps liveness independent from PostgreSQL', async () => {
    const check = vi.fn().mockResolvedValue({ status: 'ok' });
    const databaseCheck = vi.fn();
    const database = { check: databaseCheck } as unknown as DatabaseHealthIndicator;
    const service = new HealthService({ check } as unknown as HealthCheckService, database);

    await expect(service.checkLiveness()).resolves.toEqual({ status: 'ok' });
    expect(check).toHaveBeenCalledWith([]);
    expect(databaseCheck).not.toHaveBeenCalled();
  });

  it('registers PostgreSQL as a readiness dependency', async () => {
    const check = vi.fn().mockImplementation(async (indicators: (() => unknown)[]) => {
      await Promise.all(indicators.map((indicator) => indicator()));
      return { status: 'ok' };
    });
    const databaseCheck = vi.fn().mockResolvedValue({ database: { status: 'up' } });
    const database = { check: databaseCheck } as unknown as DatabaseHealthIndicator;
    const service = new HealthService({ check } as unknown as HealthCheckService, database);

    await expect(service.checkReadiness()).resolves.toEqual({ status: 'ok' });
    expect(check).toHaveBeenCalledOnce();
    expect(databaseCheck).toHaveBeenCalledOnce();
  });
});
