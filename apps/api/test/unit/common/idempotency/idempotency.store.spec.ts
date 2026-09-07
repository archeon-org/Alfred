import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { IdempotencyKeyEntity } from '@api/common/idempotency/idempotency-key.entity';
import { IdempotencyStore } from '@api/common/idempotency/idempotency.store';

function fixture() {
  const query = vi.fn();
  return {
    query,
    store: new IdempotencyStore({ query } as unknown as Repository<IdempotencyKeyEntity>),
  };
}

describe('IdempotencyStore', () => {
  it('parameterizes the reservation and expires only finite entries before conflict-safe INSERT', async () => {
    const { query, store } = fixture();
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ key: 'key' }]);
    await expect(store.reserve('owner', 'key', 'hash', 'generation')).resolves.toBe(true);
    expect(query.mock.calls[0]?.[0]).toContain('"expires_at" < now()');
    expect(query.mock.calls[1]?.[0]).toContain('ON CONFLICT ("owner_user_id", "key") DO NOTHING');
    expect(query.mock.calls[1]?.[1]).toEqual(['owner', 'key', 'hash', 'generation']);
    query.mockResolvedValue([]);
    await expect(store.reserve('owner', 'key', 'hash', 'generation')).resolves.toBe(false);
  });

  it('reads only within the authenticated owner and key', async () => {
    const { query, store } = fixture();
    query.mockResolvedValue([]);
    await expect(store.find('owner', 'key')).resolves.toBeNull();
    query.mockResolvedValue([{ requestHash: 'hash', responseStatus: 204, responseBody: null }]);
    await expect(store.find('owner', 'key')).resolves.toEqual({
      requestHash: 'hash',
      responseStatus: 204,
      responseBody: null,
    });
    expect(query.mock.calls[0]?.[1]).toEqual(['owner', 'key']);
  });

  it('stores JSON null and only completes the matching pending reservation', async () => {
    const { query, store } = fixture();
    query.mockResolvedValue([{ key: 'key' }]);
    await store.complete('owner', 'key', 'hash', 204, null, 'generation');
    expect(query.mock.calls[0]?.[1]).toEqual(['owner', 'key', 'hash', 204, 'null', 'generation']);
    expect(query.mock.calls[0]?.[0]).toContain('"response_status" IS NULL');
    // SELECT wrapper avoids TypeORM UPDATE raw results being [rows, affected].
    expect(query.mock.calls[0]?.[0]).toContain('SELECT "key" FROM completed');
    expect(query.mock.calls[0]?.[0]).toContain('"reservation_id" = $6');
    expect(query.mock.calls[0]?.[0]).toContain('"expires_at" >= now()');
    query.mockResolvedValue([]);
    await expect(store.complete('owner', 'key', 'hash', 201, {}, 'generation')).rejects.toThrow(
      'could not be persisted',
    );
  });
});
