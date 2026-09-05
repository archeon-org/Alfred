import { describe, expect, it } from 'vitest';

import { CreateIdentityFoundation1788464265141 } from '../../src/database/migrations/1788464265141-create-identity-foundation';

describe('migration ordering contract', () => {
  it('uses a real millisecond timestamp that precedes newly generated migrations', () => {
    const migration = new CreateIdentityFoundation1788464265141();
    const timestamp = Number.parseInt(migration.name.slice(-13), 10);

    expect(timestamp).toBe(1_788_464_265_141);
    expect(timestamp).toBeLessThan(Date.now());
  });
});
