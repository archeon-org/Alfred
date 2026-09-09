import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { GeneralizeOauthLoginState1788527000000 } from '@api/database/migrations/1788527000000-generalize-oauth-login-state';
import { IndexRefreshSessionReplacement1788515667301 } from '@api/database/migrations/1788515667301-index-refresh-session-replacement';
import { databaseMigrations } from '@api/database/migrations';
import {
  API_TABLE_RENAMES,
  PrefixApiTables1788979000000,
} from '@api/database/migrations/1788979000000-prefix-api-tables';
import { databaseEntities } from '@api/database/typeorm.options';
import { getMetadataArgsStorage } from 'typeorm';

describe('database migration registry', () => {
  it('registers every timestamped migration source file exactly once', () => {
    const migrationDirectory = resolve(process.cwd(), 'src/database/migrations');
    const sourceTimestamps = readdirSync(migrationDirectory)
      .flatMap((fileName) => /^([0-9]{13})-.+\.ts$/u.exec(fileName)?.[1] ?? [])
      .sort();
    const registeredTimestamps = databaseMigrations
      .map((Migration) => new Migration().name.slice(-13))
      .sort();

    expect(registeredTimestamps).toEqual(sourceTimestamps);
    expect(new Set(registeredTimestamps).size).toBe(registeredTimestamps.length);
  });

  it('renames every API table to its prefixed name and reverses in dependency order', async () => {
    const entityTables = getMetadataArgsStorage()
      .tables.filter(({ target }) => (databaseEntities as readonly unknown[]).includes(target))
      .map(({ name }) => name)
      .sort();
    expect(API_TABLE_RENAMES.map(([, next]) => next).sort()).toEqual(entityTables);
    expect(API_TABLE_RENAMES.every(([previous, next]) => next === `api_${previous}`)).toBe(true);

    const migration = new PrefixApiTables1788979000000();
    const query = vi.fn().mockResolvedValue(undefined);
    await migration.up({ query } as unknown as QueryRunner);
    expect(query.mock.calls.map(([statement]) => String(statement))).toEqual([
      'ALTER TABLE "users" RENAME TO "api_users"',
      'ALTER TABLE "user_identities" RENAME TO "api_user_identities"',
      'ALTER TABLE "oauth_login_states" RENAME TO "api_oauth_login_states"',
      'ALTER TABLE "refresh_sessions" RENAME TO "api_refresh_sessions"',
      'ALTER TABLE "idempotency_keys" RENAME TO "api_idempotency_keys"',
    ]);

    query.mockClear();
    await migration.down({ query } as unknown as QueryRunner);
    expect(query.mock.calls.map(([statement]) => String(statement))).toEqual([
      'ALTER TABLE "api_idempotency_keys" RENAME TO "idempotency_keys"',
      'ALTER TABLE "api_refresh_sessions" RENAME TO "refresh_sessions"',
      'ALTER TABLE "api_oauth_login_states" RENAME TO "oauth_login_states"',
      'ALTER TABLE "api_user_identities" RENAME TO "user_identities"',
      'ALTER TABLE "api_users" RENAME TO "users"',
    ]);
  });

  it('migrates one-time OAuth state to provider-bound JSON context', async () => {
    const migration = new GeneralizeOauthLoginState1788527000000();
    const query = vi.fn().mockResolvedValue(undefined);

    await migration.up({ query } as unknown as QueryRunner);

    const statements = query.mock.calls.map(([statement]) => String(statement));
    expect(statements.join('\n')).toContain('"provider_key"');
    expect(statements.join('\n')).toContain('"provider_context"');
    expect(statements.join('\n')).toContain('jsonb_build_object');
    expect(statements.join('\n')).toContain('DROP COLUMN "code_verifier"');
    expect(statements.join('\n')).toContain('DROP COLUMN "nonce"');
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

  it('repairs the index on the renamed api_ table after a post-rename ledger retry', async () => {
    const migration = new IndexRefreshSessionReplacement1788515667301();
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        { isValid: false, matchesExpectedDefinition: true, tableName: 'api_refresh_sessions' },
      ]);

    await migration.up({ query } as unknown as QueryRunner);

    expect(query.mock.calls[2]?.[0]).toContain("IN ('refresh_sessions', 'api_refresh_sessions')");
    expect(query).toHaveBeenNthCalledWith(
      5,
      'CREATE INDEX CONCURRENTLY "idx_refresh_sessions_replacement" ON "api_refresh_sessions" ("replaced_by_session_id")',
    );
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
