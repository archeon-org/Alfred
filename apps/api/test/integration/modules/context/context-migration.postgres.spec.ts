import { createHash, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { databaseMigrations } from '@api/database/migrations';
import { CreateContextDocuments1789160000000 } from '@api/database/migrations/1789160000000-create-context-documents';
import { databaseEntities } from '@api/database/typeorm.options';

const url = process.env.TEST_MIGRATION_DATABASE_URL;
const postgres = url ? describe : describe.skip;

postgres('context migration fidelity and guarded rollback', () => {
  it('preserves exact legacy content and restores latest context without silently dropping new scopes', async () => {
    const database = await new DataSource({
      type: 'postgres',
      url: url!,
      entities: [...databaseEntities],
      migrations: [...databaseMigrations],
      migrationsTableName: API_MIGRATIONS_TABLE,
      installExtensions: false,
      synchronize: false,
      migrationsRun: false,
    }).initialize();
    await database.runMigrations({ transaction: 'each' });
    const runner = database.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new CreateContextDocuments1789160000000();
      // All fixture schema changes roll back below, including a down/up round trip.
      await runner.query('DELETE FROM api_context_documents');
      await migration.down(runner);
      const userId = randomUUID();
      const projectId = randomUUID();
      const content = '  # Historique\r\nTexte émoji 🧠\r\n  ';
      await runner.query(
        `INSERT INTO api_users(id, tenant_id, email, display_name) SELECT $1, id, $2, 'Migration fixture' FROM api_tenants WHERE slug = 'default'`,
        [userId, `${userId}@example.test`],
      );
      await runner.query(
        `INSERT INTO api_projects(id, tenant_id, owner_user_id, kind, name, description, context) SELECT $1, tenant_id, id, 'named', 'Legacy', 'Historical description', $3 FROM api_users WHERE id = $2`,
        [projectId, userId, content],
      );
      await migration.up(runner);
      const migrated = (await runner.query(
        `SELECT content, revision, content_hash FROM api_context_documents WHERE project_id = $1`,
        [projectId],
      )) as { content: string; revision: number; content_hash: string }[];
      expect(migrated).toEqual([
        { content, revision: 1, content_hash: createHash('sha256').update(content).digest('hex') },
      ]);
      expect(
        await runner.query(`SELECT description FROM api_projects WHERE id = $1`, [projectId]),
      ).toEqual([{ description: 'Historical description' }]);
      await runner.query(
        `UPDATE api_context_documents SET content = 'Latest', revision = 2 WHERE project_id = $1`,
        [projectId],
      );
      await runner.query(
        `INSERT INTO api_context_documents(user_id, kind, content, revision, content_hash) VALUES ($1, 'preferences', 'Private preferences', 1, $2)`,
        [userId, '0'.repeat(64)],
      );
      await runner.query('SAVEPOINT guarded_downgrade');
      await expect(migration.down(runner)).rejects.toThrow(
        'Export personal context and project preferences',
      );
      await runner.query('ROLLBACK TO SAVEPOINT guarded_downgrade');
      expect(
        await runner.query(`SELECT content FROM api_context_documents WHERE user_id = $1`, [
          userId,
        ]),
      ).toEqual([{ content: 'Private preferences' }]);
      await runner.query(
        `UPDATE api_context_documents SET content = '', revision = 2 WHERE user_id = $1`,
        [userId],
      );
      await migration.down(runner);
      expect(
        await runner.query(`SELECT context, description FROM api_projects WHERE id = $1`, [
          projectId,
        ]),
      ).toEqual([{ context: 'Latest', description: 'Historical description' }]);
      await migration.up(runner);
      expect(
        await runner.query(`SELECT content FROM api_context_documents WHERE project_id = $1`, [
          projectId,
        ]),
      ).toEqual([{ content: 'Latest' }]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
      await database.destroy();
    }
  });
});
