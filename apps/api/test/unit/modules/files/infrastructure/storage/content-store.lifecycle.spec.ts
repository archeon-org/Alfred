import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import {
  type ArtifactContentStore,
  ContentStoreError,
} from '@api/modules/files/domain/content-store.port';
import { ContentStoreLifecycle } from '@api/modules/files/infrastructure/storage/content-store.lifecycle';

const flags = (enabled: boolean) =>
  ({ isEnabled: () => enabled }) as unknown as FeatureFlagsService;

const storeWith = (answer: () => Promise<void>) => {
  const probe = vi.fn(answer);
  const close = vi.fn(() => Promise.resolve());
  return { store: { probe, close } as unknown as ArtifactContentStore, probe, close };
};

const local = { driver: 'local', root: '/srv/uploads' } as const;

describe('content store lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('touches no storage while the capability is off', async () => {
    const { store, probe } = storeWith(() => Promise.resolve());
    const lifecycle = new ContentStoreLifecycle(store, local, flags(false));

    await lifecycle.onModuleInit();

    expect(probe).not.toHaveBeenCalled();
    await expect(lifecycle.check()).resolves.toEqual({});
  });

  it('refuses to start when the store cannot be written to', async () => {
    const { store } = storeWith(() => Promise.reject(new ContentStoreError('storage_unreachable')));

    await expect(
      new ContentStoreLifecycle(store, local, flags(true)).onModuleInit(),
    ).rejects.toMatchObject({ code: 'storage_unreachable' });
  });

  it('reports readiness from a cached probe', async () => {
    vi.useFakeTimers();
    const { store, probe } = storeWith(() => Promise.resolve());
    const lifecycle = new ContentStoreLifecycle(store, local, flags(true));
    await lifecycle.onModuleInit();

    await expect(lifecycle.check()).resolves.toEqual({ storage: { status: 'up' } });
    await lifecycle.check();
    expect(probe).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(31_000);
    probe.mockRejectedValueOnce(new ContentStoreError('storage_unreachable'));
    await expect(lifecycle.check()).resolves.toEqual({ storage: { status: 'down' } });
  });

  it('releases the store at shutdown', async () => {
    const { store, close } = storeWith(() => Promise.resolve());

    await new ContentStoreLifecycle(store, local, flags(true)).onApplicationShutdown();

    expect(close).toHaveBeenCalledOnce();
  });
});
