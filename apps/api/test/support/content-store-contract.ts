import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';

import { sha256Of } from '@api/modules/files/domain/content-digest';
import type { ArtifactContentStore } from '@api/modules/files/domain/content-store.port';

/**
 * The behaviour every content adapter owes its callers, whatever the provider behind it. Both the
 * on-disk development store and the S3-compatible production store run this suite, so a
 * deployment that switches store keeps identical product semantics (ALF-DEC-054, ALF-DEC-029).
 */
export function describeContentStoreContract(create: () => ArtifactContentStore): void {
  // Against a real bucket, every object this suite stores is removed when it ends.
  const written: { readonly store: ArtifactContentStore; readonly contentId: string }[] = [];
  const createStore = (): ArtifactContentStore => {
    const store = create();
    const put = store.put.bind(store);
    store.put = (contentId, bytes, options) => {
      written.push({ store, contentId });
      return put(contentId, bytes, options);
    };
    return store;
  };
  afterAll(async () => {
    for (const { store, contentId } of written)
      await store.delete(contentId).catch(() => undefined);
  });

  it('reads back exactly the bytes it stored, and reports their size and digest', async () => {
    const store = createStore();
    const contentId = randomUUID();
    const bytes = Buffer.from('un document confidentiel', 'utf8');

    const stored = await store.put(contentId, bytes, { mediaType: 'text/plain' });

    expect(stored).toEqual({ byteSize: bytes.byteLength, sha256: sha256Of(bytes) });
    expect(await store.get(contentId)).toEqual(bytes);
  });

  it('preserves binary content untouched', async () => {
    const store = createStore();
    const contentId = randomUUID();
    // A PDF header followed by bytes that are not valid UTF-8: nothing may re-encode them.
    const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x00, 0xff, 0xfe]);

    await store.put(contentId, bytes, { mediaType: 'application/pdf' });

    expect(await store.get(contentId)).toEqual(bytes);
  });

  it('reports absent content instead of failing', async () => {
    const store = createStore();

    expect(await store.get(randomUUID())).toBeNull();
    expect(await store.exists(randomUUID())).toBe(false);
  });

  it('answers whether content exists', async () => {
    const store = createStore();
    const contentId = randomUUID();

    await store.put(contentId, Buffer.from('x'), { mediaType: 'text/plain' });

    expect(await store.exists(contentId)).toBe(true);
  });

  it('accepts the same bytes again, so an upload retry is harmless', async () => {
    const store = createStore();
    const contentId = randomUUID();
    const bytes = Buffer.from('premier');

    await store.put(contentId, bytes, { mediaType: 'text/plain' });

    await expect(store.put(contentId, bytes, { mediaType: 'text/plain' })).resolves.toEqual({
      byteSize: bytes.byteLength,
      sha256: sha256Of(bytes),
    });
  });

  it('refuses different bytes under a stored identity and keeps the original', async () => {
    const store = createStore();
    const contentId = randomUUID();
    await store.put(contentId, Buffer.from('premier'), { mediaType: 'text/plain' });

    await expect(
      store.put(contentId, Buffer.from('second'), { mediaType: 'text/plain' }),
    ).rejects.toMatchObject({ code: 'content_conflict' });

    expect(await store.get(contentId)).toEqual(Buffer.from('premier'));
  });

  it('deletes content, and deleting again still succeeds', async () => {
    const store = createStore();
    const contentId = randomUUID();
    await store.put(contentId, Buffer.from('x'), { mediaType: 'text/plain' });

    await store.delete(contentId);
    await expect(store.delete(contentId)).resolves.toBeUndefined();

    expect(await store.exists(contentId)).toBe(false);
  });

  it('refuses an identifier that could escape its location', async () => {
    const store = createStore();

    for (const crafted of ['../../../../etc/passwd', '..', 'a/b', 'A1B2C3', 'x'.repeat(65), '']) {
      await expect(store.get(crafted)).rejects.toMatchObject({ code: 'invalid_identifier' });
    }
  });

  it('proves it can be written to', async () => {
    await expect(createStore().probe()).resolves.toBeUndefined();
  });
}
