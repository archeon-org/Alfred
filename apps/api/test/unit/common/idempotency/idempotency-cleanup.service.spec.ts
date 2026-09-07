import { Logger } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdempotencyCleanupService } from '@api/common/idempotency/idempotency-cleanup.service';
import type { IdempotencyKeyEntity } from '@api/common/idempotency/idempotency-key.entity';

afterEach(() => vi.useRealTimers());

describe('IdempotencyCleanupService', () => {
  it('purges with the database clock even when the application clock is fast', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-01-01'));
    const remove = vi.fn().mockResolvedValue([{ deleted: 3 }]);
    const service = new IdempotencyCleanupService({
      query: remove,
    } as unknown as Repository<IdempotencyKeyEntity>);
    await expect(service.purge()).resolves.toBe(3);
    expect(remove.mock.calls[0]?.[0]).toContain('"expires_at" < now()');
    expect(remove.mock.calls[0]).toHaveLength(1);
  });

  it('starts an hourly unrefed timer, survives DB errors and stops on shutdown', async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const info = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const remove = vi
      .fn()
      .mockRejectedValueOnce(new Error('private DB details'))
      .mockResolvedValueOnce([{ deleted: 1 }])
      .mockResolvedValue([]);
    const service = new IdempotencyCleanupService({
      query: remove,
    } as unknown as Repository<IdempotencyKeyEntity>);
    await service.onApplicationBootstrap();
    expect(log).toHaveBeenCalledWith('Idempotency cleanup failed');
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(info).toHaveBeenCalledWith('Purged 1 expired idempotency keys');
    await expect(service.purge()).resolves.toBe(0);
    service.onApplicationShutdown();
    service.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(remove).toHaveBeenCalledTimes(3);
  });
});
