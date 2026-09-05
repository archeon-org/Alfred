import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { IndexRefreshSessionReplacement1788515667301 } from '../../src/database/migrations/1788515667301-index-refresh-session-replacement';
import { databaseMigrations } from '../../src/database/migrations';

describe('database migration registry', () => {
  it('registers every timestamped migration source file exactly once', () => {
    const migrationDirectory = resolve(__dirname, '../../src/database/migrations');
    const sourceTimestamps = readdirSync(migrationDirectory)
      .flatMap((fileName) => /^([0-9]{13})-.+\.ts$/u.exec(fileName)?.[1] ?? [])
      .sort();
    const registeredTimestamps = databaseMigrations
      .map((Migration) => new Migration().name.slice(-13))
      .sort();

    expect(registeredTimestamps).toEqual(sourceTimestamps);
    expect(new Set(registeredTimestamps).size).toBe(registeredTimestamps.length);
  });

  it('creates the refresh replacement index concurrently outside a transaction', async () => {
    const migration = new IndexRefreshSessionReplacement1788515667301();
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(migration.transaction).toBe(false);
    expect(query).toHaveBeenNthCalledWith(1, "SET statement_timeout = '15min'");
    expect(query).toHaveBeenNthCalledWith(2, 'SET lock_timeout = 0');
    expect(query.mock.calls[2]?.[0]).toContain('FROM pg_class AS index_relation');
    expect(query).toHaveBeenNthCalledWith(
      4,
      'CREATE INDEX CONCURRENTLY "idx_refresh_sessions_replacement" ON "refresh_sessions" ("replaced_by_session_id")',
    );
    expect(query).toHaveBeenNthCalledWith(5, 'RESET lock_timeout');
    expect(query).toHaveBeenNthCalledWith(6, 'RESET statement_timeout');
  });

  it('repairs a matching invalid index before retrying concurrent creation', async () => {
    const migration = new IndexRefreshSessionReplacement1788515667301();
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        {
          isValid: false,
          matchesExpectedDefinition: true,
        },
      ]);

    await migration.up({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenNthCalledWith(
      4,
      'DROP INDEX CONCURRENTLY "public"."idx_refresh_sessions_replacement"',
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      'CREATE INDEX CONCURRENTLY "idx_refresh_sessions_replacement" ON "refresh_sessions" ("replaced_by_session_id")',
    );
    expect(query).toHaveBeenNthCalledWith(6, 'RESET lock_timeout');
    expect(query).toHaveBeenNthCalledWith(7, 'RESET statement_timeout');
  });

  it('accepts an already-valid matching index after a migration-ledger retry', async () => {
    const migration = new IndexRefreshSessionReplacement1788515667301();
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        {
          isValid: true,
          matchesExpectedDefinition: true,
        },
      ]);

    await migration.up({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledTimes(5);
    expect(query).toHaveBeenNthCalledWith(4, 'RESET lock_timeout');
    expect(query).toHaveBeenLastCalledWith('RESET statement_timeout');
  });

  it('refuses to replace an unexpected index with the reserved name', async () => {
    const migration = new IndexRefreshSessionReplacement1788515667301();
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        {
          isValid: false,
          matchesExpectedDefinition: false,
        },
      ]);

    await expect(migration.up({ query } as unknown as QueryRunner)).rejects.toThrow(
      /unexpected definition/u,
    );

    expect(query).toHaveBeenCalledTimes(5);
    expect(query).toHaveBeenNthCalledWith(4, 'RESET lock_timeout');
    expect(query).toHaveBeenLastCalledWith('RESET statement_timeout');
  });

  it('restores the migration connection timeout when concurrent index creation fails', async () => {
    const migration = new IndexRefreshSessionReplacement1788515667301();
    const failure = new Error('index creation failed');
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await expect(migration.up({ query } as unknown as QueryRunner)).rejects.toBe(failure);

    expect(query).toHaveBeenNthCalledWith(5, 'RESET lock_timeout');
    expect(query).toHaveBeenNthCalledWith(6, 'RESET statement_timeout');
  });

  it('disables connection lock timeout while dropping the index and restores both settings', async () => {
    const migration = new IndexRefreshSessionReplacement1788515667301();
    const query = vi.fn();

    await migration.down({ query } as unknown as QueryRunner);

    const statements: unknown[] = query.mock.calls.map((call) => call[0] as unknown);
    expect(statements).toEqual([
      "SET statement_timeout = '15min'",
      'SET lock_timeout = 0',
      'DROP INDEX CONCURRENTLY "public"."idx_refresh_sessions_replacement"',
      'RESET lock_timeout',
      'RESET statement_timeout',
    ]);
  });
});
