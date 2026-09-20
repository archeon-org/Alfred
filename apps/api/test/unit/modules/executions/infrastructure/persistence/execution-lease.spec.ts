import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { ExecutionLeaseStore } from '@api/modules/executions/infrastructure/persistence/execution-lease.store';

describe('durable execution leases', () => {
  it('claims recoverable work with a database-clock lease and a fencing increment', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const store = new ExecutionLeaseStore({ query } as unknown as DataSource);
    expect(await store.claim('worker-1', 30_000)).toBeNull();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE SKIP LOCKED'), [
      'worker-1',
      30_000,
    ]);
    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain('lease_version" + 1');
    expect(sql).toContain('clock_timestamp()');
    expect(sql).not.toContain('created_at" <');
  });

  it('a stale worker cannot renew after its lease expired or a successor claimed it', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const store = new ExecutionLeaseStore({ query } as unknown as DataSource);
    expect(
      await store.renew(
        { id: 'e', invocationId: 'i', bindingGeneration: 'g', leaseOwner: 'old', leaseVersion: 1 },
        30_000,
      ),
    ).toBe(false);
    expect(query.mock.calls[0]?.[0]).toContain('lease_expires_at" > clock_timestamp()');
    expect(query.mock.calls[0]?.[1]).toEqual(['e', 'i', 'g', 'old', 1, 30_000]);
  });
  it('cannot adopt a successor lease if fetching the claimed row was delayed', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 'e', lease_version: 7 }]);
    const findOneBy = vi.fn().mockResolvedValue(null);
    const store = new ExecutionLeaseStore({
      query,
      getRepository: () => ({ findOneBy }),
    } as unknown as DataSource);
    expect(await store.claim('original', 30000)).toBeNull();
    expect(findOneBy).toHaveBeenCalledWith({ id: 'e', leaseOwner: 'original', leaseVersion: 7 });
  });
});
