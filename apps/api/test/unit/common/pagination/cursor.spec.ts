import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from '@api/common/pagination/cursor';

const value = {
  id: '00000000-0000-4000-8000-000000000001',
  sortValue: '2026-09-07T12:00:00.123456Z',
};
const raw = (input: unknown) => Buffer.from(JSON.stringify(input)).toString('base64url');

describe('cursor codec', () => {
  it('round trips without losing database precision', () => {
    expect(decodeCursor(encodeCursor(value))).toEqual(value);
    expect(encodeCursor(value)).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  it.each([
    '',
    '!',
    'a'.repeat(513),
    'not-json',
    `${raw(value)}=`,
    raw(null),
    raw([]),
    raw({ ...value, id: 'invalid' }),
    raw({ ...value, sortValue: 1 }),
    raw({ id: value.id }),
    raw({ ...value, extra: true }),
  ])('rejects malformed cursor %s', (input) => {
    expect(decodeCursor(input)).toBeNull();
  });

  it('refuses to encode a cursor the decoder cannot accept', () => {
    expect(() => encodeCursor({ ...value, sortValue: 'x'.repeat(512) })).toThrow();
  });
});
