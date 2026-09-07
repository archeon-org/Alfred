import { getMetadataArgsStorage, type QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { IdempotencyKeyEntity } from '@api/common/idempotency/idempotency-key.entity';
import { CreateIdempotencyKeys1788739200000 } from '@api/database/migrations/1788739200000-create-idempotency-keys';
import { databaseEntities } from '@api/database/typeorm.options';

// Real schema-builder parity and SQL constraint enforcement also run in the PostgreSQL suite.
describe('idempotency schema contract', () => {
  it('registers a composite owner/key entity, named checks, expiry index and cascading FK', () => {
    const metadata = getMetadataArgsStorage();
    expect(databaseEntities).toContain(IdempotencyKeyEntity);
    const columns = metadata.columns.filter(({ target }) => target === IdempotencyKeyEntity);
    expect(
      columns.filter(({ options }) => options.primary).map(({ propertyName }) => propertyName),
    ).toEqual(['ownerUserId', 'key']);
    expect(
      columns
        .filter(({ options }) => options.primary)
        .every(({ options }) => options.primaryKeyConstraintName === 'pk_idempotency_keys'),
    ).toBe(true);
    expect(metadata.indices.filter(({ target }) => target === IdempotencyKeyEntity)).toMatchObject([
      { name: 'idx_idempotency_keys_expiry', columns: ['expiresAt'] },
    ]);
    expect(
      metadata.relations.find(({ target }) => target === IdempotencyKeyEntity)?.options,
    ).toMatchObject({ onDelete: 'CASCADE' });
    expect(
      metadata.joinColumns.find(({ target }) => target === IdempotencyKeyEntity),
    ).toMatchObject({
      name: 'owner_user_id',
      foreignKeyConstraintName: 'fk_idempotency_keys_owner',
    });
    const expiry = columns.find(({ propertyName }) => propertyName === 'expiresAt');
    expect((expiry?.options.default as () => string)()).toBe("(now() + '24:00:00')");
  });

  it('uses the same check expressions in the explicit migration and entity', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const migration = new CreateIdempotencyKeys1788739200000();
    await migration.up({ query } as unknown as QueryRunner);
    const statements = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    for (const check of getMetadataArgsStorage().checks.filter(
      ({ target }) => target === IdempotencyKeyEntity,
    )) {
      expect(statements).toContain(
        `CONSTRAINT "${check.name}" CHECK (${String(check.expression)})`,
      );
    }
    expect(statements).toContain("DEFAULT now() + interval '24 hours'");
    await migration.down({ query } as unknown as QueryRunner);
    expect(query).toHaveBeenLastCalledWith('DROP TABLE "idempotency_keys"');
  });
});
