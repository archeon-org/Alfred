import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import { FileCollector } from '@api/modules/files/application/file-collector';
import type { ArtifactContentStore } from '@api/modules/files/domain/content-store.port';
import { FakeDb } from '../../../../support/fake-db';

function fixture(rows: { id: string; state: string }[]) {
  const db = new FakeDb();
  const queue = [...rows];
  db.when(/FOR UPDATE SKIP LOCKED/u, () => {
    const next = queue.shift();
    return next === undefined ? [] : [next];
  });
  const store = { delete: vi.fn().mockResolvedValue(undefined) };
  const collector = new FileCollector(
    db.asDataSource(),
    store as unknown as ArtifactContentStore,
    {
      isEnabled: () => true,
    } as unknown as FeatureFlagsService,
  );
  return { db, store, collector };
}

describe('FileCollector', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes the bytes of a deleted file and keeps its content row as a record', async () => {
    const { db, store, collector } = fixture([{ id: 'deleted', state: 'purging' }]);

    await collector.sweep();

    expect(store.delete).toHaveBeenCalledWith('deleted');
    expect(db.parametersOf(/SET "state" = 'purged'/u)).toEqual(['deleted']);
    expect(db.ran(/DELETE FROM "api_artifact_contents"/u)).toBe(false);
  });

  it('ends an expired reservation first, and removes it with its bytes only after the grace period', async () => {
    const { db, store, collector } = fixture([
      { id: 'expired', state: 'pending' },
      { id: 'abandoned', state: 'failed' },
    ]);

    await collector.sweep();

    // A write may still land under an expired reservation: its row, the only record of those
    // bytes, stays. Only a content that failed long enough ago leaves, row included.
    expect(db.parametersOf(/SET "state" = 'failed', "expires_at" = NULL/u)).toEqual(['expired']);
    expect(store.delete.mock.calls.map(([id]) => id as string)).toEqual(['abandoned']);
    expect(
      db.statements
        .filter(({ sql }) => sql.startsWith('DELETE FROM "api_artifact_contents"'))
        .map(({ parameters }) => parameters[0]),
    ).toEqual(['abandoned']);
  });

  it('keeps the row when the provider refuses the delete, so the next sweep retries', async () => {
    const { db, store, collector } = fixture([{ id: 'deleted', state: 'purging' }]);
    store.delete.mockRejectedValue(new Error('provider down'));

    await expect(collector.sweep()).rejects.toThrow('refused to delete 1 content');
    expect(db.ran(/SET "state" = 'purged'/u)).toBe(false);
  });

  it('goes on past a content the provider refuses, without retrying it in the same sweep', async () => {
    const { db, store, collector } = fixture([
      { id: 'stuck', state: 'purging' },
      { id: 'behind', state: 'purging' },
    ]);
    store.delete.mockImplementation((id: string) =>
      id === 'stuck' ? Promise.reject(new Error('provider down')) : Promise.resolve(),
    );

    await expect(collector.sweep()).rejects.toThrow('refused to delete 1 content');

    expect(store.delete.mock.calls.map(([id]) => id as string)).toEqual(['stuck', 'behind']);
    expect(db.parametersOf(/SET "state" = 'purged'/u)).toEqual(['behind']);
    // The refused identity is excluded from every later claim of this sweep.
    const claims = db.statements.filter(({ sql }) => /FOR UPDATE SKIP LOCKED/u.test(sql));
    expect(claims.at(-1)?.parameters[0]).toEqual(['stuck']);
  });

  it('stays idle while the capability is off, sweeps when on, and stops at shutdown', async () => {
    vi.useFakeTimers();
    const idle = new FakeDb();
    new FileCollector(idle.asDataSource(), {} as ArtifactContentStore).onModuleInit();
    vi.advanceTimersByTime(120_000);
    expect(idle.query).not.toHaveBeenCalled();

    const { db, collector } = fixture([]);
    collector.onModuleInit();
    await vi.advanceTimersByTimeAsync(61_000);
    const sweeps = db.query.mock.calls.length;
    expect(sweeps).toBeGreaterThanOrEqual(2);
    await collector.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(db.query.mock.calls.length).toBe(sweeps);
  });
});
