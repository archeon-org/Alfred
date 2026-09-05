import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import type { RefreshSessionEntity } from '@api/modules/auth/infrastructure/persistence/entities/refresh-session.entity';
import { RefreshSessionCleanupService } from '@api/modules/auth/infrastructure/persistence/refresh-session-cleanup.service';

function configService(): ConfigService {
  const values: Readonly<Record<string, number>> = {
    AUTH_SESSION_CLEANUP_INTERVAL_SECONDS: 3_600,
    AUTH_SESSION_RETENTION_SECONDS: 86_400,
  };
  return { getOrThrow: vi.fn((key: string) => values[key]) } as unknown as ConfigService;
}

describe('RefreshSessionCleanupService', () => {
  it('uses expiration as the only cleanup clock so rotation tombstones outlive token validity', async () => {
    const remove = vi
      .fn<(criteria: unknown) => Promise<{ affected: number }>>()
      .mockResolvedValue({ affected: 3 });
    const repository = { delete: remove } as unknown as Repository<RefreshSessionEntity>;
    const service = new RefreshSessionCleanupService(repository, configService());

    await expect(service.purge(new Date('2026-09-03T12:00:00.000Z'))).resolves.toBe(3);
    const conditions = remove.mock.calls[0]?.[0];
    expect(Array.isArray(conditions)).toBe(false);
    expect(JSON.stringify(conditions)).toContain('2026-09-02T12:00:00.000Z');
    expect(JSON.stringify(conditions)).not.toContain('revokedAt');
    expect(JSON.stringify(conditions)).not.toContain('rotatedAt');
  });

  it('starts one unrefed cleanup interval and clears it on shutdown', async () => {
    vi.useFakeTimers();
    const remove = vi
      .fn<(criteria: unknown) => Promise<{ affected: number }>>()
      .mockResolvedValue({ affected: 0 });
    const repository = { delete: remove } as unknown as Repository<RefreshSessionEntity>;
    const service = new RefreshSessionCleanupService(repository, configService());

    await service.onApplicationBootstrap();
    expect(remove).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(remove).toHaveBeenCalledTimes(2);
    service.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(remove).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
