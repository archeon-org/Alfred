import { describe, expect, it, vi } from 'vitest';

import { DatabaseHealthIndicator } from '../../src/modules/health/database-health.indicator';
import type { PrismaService } from '../../src/modules/prisma/prisma.service';

describe('DatabaseHealthIndicator', () => {
  it('reports PostgreSQL as up after a successful probe', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ result: 1 }]);
    const indicator = new DatabaseHealthIndicator({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

    await expect(indicator.check()).resolves.toEqual({
      database: { status: 'up' },
    });
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it('reports PostgreSQL as down without leaking the driver error', async () => {
    const queryRaw = vi
      .fn()
      .mockRejectedValue(new Error('password authentication failed for secret-user'));
    const indicator = new DatabaseHealthIndicator({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

    const result = await indicator.check();

    expect(result).toEqual({ database: { status: 'down' } });
    expect(JSON.stringify(result)).not.toContain('secret-user');
  });
});
