import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { contentObjectKey, ContentStoreError } from '@api/modules/files/domain/content-store.port';

describe('content object key', () => {
  it('carries nothing but the opaque content identity', () => {
    const contentId = randomUUID();

    expect(contentObjectKey(contentId)).toBe(`contents/${contentId.slice(0, 2)}/${contentId}`);
  });

  it.each(['', 'a', '..', '../x', 'a/b', 'a\\b', 'UPPER-CASE', 'dot.ted', 'nul\0', 'x'.repeat(65)])(
    'refuses %j',
    (crafted) => {
      expect(() => contentObjectKey(crafted)).toThrow(ContentStoreError);
    },
  );

  it('spreads random identities across the fan-out directories', () => {
    const shards = new Set(Array.from({ length: 2_000 }, () => randomUUID().slice(0, 2)));

    // 256 possible shards; a time-ordered identity scheme would collapse them into a handful.
    expect(shards.size).toBeGreaterThan(200);
  });
});
