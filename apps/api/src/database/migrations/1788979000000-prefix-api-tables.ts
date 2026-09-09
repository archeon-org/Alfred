import type { MigrationInterface, QueryRunner } from 'typeorm';

// Every table owned by the NestJS API carries the `api_` prefix so that it can share one PostgreSQL
// database with the LangGraph runtime tables (thread, run, checkpoints, store, ...). Constraint and
// index names already embed their table name and stay unchanged; renaming a table keeps them.
export const API_TABLE_RENAMES: ReadonlyArray<readonly [previous: string, next: string]> =
  Object.freeze([
    ['users', 'api_users'],
    ['user_identities', 'api_user_identities'],
    ['oauth_login_states', 'api_oauth_login_states'],
    ['refresh_sessions', 'api_refresh_sessions'],
    ['idempotency_keys', 'api_idempotency_keys'],
  ] as const);

export class PrefixApiTables1788979000000 implements MigrationInterface {
  name = 'PrefixApiTables1788979000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [previous, next] of API_TABLE_RENAMES) {
      await queryRunner.query(`ALTER TABLE "${previous}" RENAME TO "${next}"`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [previous, next] of [...API_TABLE_RENAMES].reverse()) {
      await queryRunner.query(`ALTER TABLE "${next}" RENAME TO "${previous}"`);
    }
  }
}
