import { describe, expect, it } from 'vitest';

import { DisabledContentStore } from '@api/modules/files/infrastructure/storage/disabled-content.store';

describe('disabled content store', () => {
  it('refuses every byte operation with a typed error', async () => {
    const store = new DisabledContentStore();

    await expect(store.put()).rejects.toMatchObject({ code: 'storage_unavailable' });
    await expect(store.get()).rejects.toMatchObject({ code: 'storage_unavailable' });
    await expect(store.exists()).rejects.toMatchObject({ code: 'storage_unavailable' });
    await expect(store.delete()).rejects.toMatchObject({ code: 'storage_unavailable' });
  });

  it('has nothing to probe or release', async () => {
    const store = new DisabledContentStore();

    await expect(store.probe()).resolves.toBeUndefined();
    await expect(store.close()).resolves.toBeUndefined();
  });
});
