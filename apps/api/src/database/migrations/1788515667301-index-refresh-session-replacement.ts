import type { MigrationInterface, QueryRunner } from 'typeorm';

interface ExistingIndexState {
  isValid: boolean;
  matchesExpectedDefinition: boolean;
}

const INDEX_NAME = 'idx_refresh_sessions_replacement';

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
           table_namespace.nspname = 'public'
             AND table_record.relname = 'refresh_sessions'
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
      await queryRunner.query(
        `CREATE INDEX CONCURRENTLY "${INDEX_NAME}" ON "refresh_sessions" ("replaced_by_session_id")`,
      );
    });
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await withConcurrentIndexTimeouts(queryRunner, async () => {
      await queryRunner.query(`DROP INDEX CONCURRENTLY "public"."${INDEX_NAME}"`);
    });
  }
}
