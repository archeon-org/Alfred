import type { MigrationInterface, QueryRunner } from 'typeorm';

interface ExistingIndexState {
  isValid: boolean;
  matchesExpectedDefinition: boolean;
  tableName: string;
}

const INDEX_NAME = 'idx_refresh_sessions_replacement';
// The table was created as "refresh_sessions" and later renamed by PrefixApiTables1788979000000.
// A ledger retry that runs after that rename must repair the same index on the renamed table.
const TABLE_NAME = 'refresh_sessions';
const RENAMED_TABLE_NAME = 'api_refresh_sessions';

async function withConcurrentIndexTimeouts<T>(
  queryRunner: QueryRunner,
  operation: () => Promise<T>,
): Promise<T> {
  await queryRunner.query("SET statement_timeout = '15min'");
  try {
    await queryRunner.query('SET lock_timeout = 0');
    try {
      return await operation();
    } finally {
      await queryRunner.query('RESET lock_timeout');
    }
  } finally {
    await queryRunner.query('RESET statement_timeout');
  }
}

export class IndexRefreshSessionReplacement1788515667301 implements MigrationInterface {
  name = 'IndexRefreshSessionReplacement1788515667301';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await withConcurrentIndexTimeouts(queryRunner, async () => {
      const existingIndexes = (await queryRunner.query(
        `SELECT
           index_record.indisvalid AS "isValid",
           table_record.relname AS "tableName",
           table_namespace.nspname = 'public'
             AND table_record.relname IN ('${TABLE_NAME}', '${RENAMED_TABLE_NAME}')
             AND access_method.amname = 'btree'
             AND NOT index_record.indisunique
             AND index_record.indnkeyatts = 1
             AND index_record.indnatts = 1
             AND pg_get_indexdef(index_record.indexrelid, 1, true) = 'replaced_by_session_id'
             AND index_record.indpred IS NULL
             AND index_record.indexprs IS NULL AS "matchesExpectedDefinition"
         FROM pg_class AS index_relation
         JOIN pg_namespace AS index_namespace
           ON index_namespace.oid = index_relation.relnamespace
         JOIN pg_index AS index_record
           ON index_record.indexrelid = index_relation.oid
         JOIN pg_class AS table_record
           ON table_record.oid = index_record.indrelid
         JOIN pg_namespace AS table_namespace
           ON table_namespace.oid = table_record.relnamespace
         JOIN pg_am AS access_method
           ON access_method.oid = index_relation.relam
         WHERE index_namespace.nspname = 'public'
           AND index_relation.relname = '${INDEX_NAME}'`,
      )) as ExistingIndexState[];
      const existingIndex = existingIndexes[0];

      if (existingIndex !== undefined && !existingIndex.matchesExpectedDefinition) {
        throw new Error(`Existing index ${INDEX_NAME} has an unexpected definition`);
      }
      if (existingIndex?.isValid) return;
      if (existingIndex !== undefined) {
        await queryRunner.query(`DROP INDEX CONCURRENTLY "public"."${INDEX_NAME}"`);
      }
      const tableName = existingIndex?.tableName ?? TABLE_NAME;
      await queryRunner.query(
        `CREATE INDEX CONCURRENTLY "${INDEX_NAME}" ON "${tableName}" ("replaced_by_session_id")`,
      );
    });
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await withConcurrentIndexTimeouts(queryRunner, async () => {
      await queryRunner.query(`DROP INDEX CONCURRENTLY "public"."${INDEX_NAME}"`);
    });
  }
}
