import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';

import { DatabaseHealthIndicator } from '@api/modules/health/database-health.indicator';

describe('DatabaseHealthIndicator', () => {
  it('reports PostgreSQL as up after a successful probe', async () => {
    const query = vi.fn().mockResolvedValue([{ result: 1 }]);
    const indicator = new DatabaseHealthIndicator({
      query,
    } as unknown as DataSource);

    await expect(indicator.check()).resolves.toEqual({
      database: { status: 'up' },
    });
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('reports PostgreSQL as down without leaking the driver error', async () => {
    const queryRaw = vi
      .fn()
      .mockRejectedValue(new Error('password authentication failed for secret-user'));
    const indicator = new DatabaseHealthIndicator({
      query: queryRaw,
    } as unknown as DataSource);

    const result = await indicator.check();

    expect(result).toEqual({ database: { status: 'down' } });
    expect(JSON.stringify(result)).not.toContain('secret-user');
  });
});
