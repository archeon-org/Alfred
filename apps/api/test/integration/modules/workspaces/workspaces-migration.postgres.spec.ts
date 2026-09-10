import { randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { databaseMigrations } from '@api/database/migrations';
import { databaseEntities } from '@api/database/typeorm.options';

const url = process.env.TEST_MIGRATION_DATABASE_URL;
const postgres = url ? describe : describe.skip;

async function rejectsConstraint(
  runner: QueryRunner,
  sql: string,
  values: unknown[],
  code: string,
) {
  await runner.query('SAVEPOINT constraint_check');
  try {
    await expect(runner.query(sql, values)).rejects.toMatchObject({ driverError: { code } });
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT constraint_check');
  }
}

postgres('workspace migration preserves private ownership', () => {
  it('backfills every tenant and user without moving resources and enforces membership integrity', async () => {
    const database = await new DataSource({
      type: 'postgres',
      url: url!,
      entities: [...databaseEntities],
      migrations: [...databaseMigrations],
      migrationsTableName: API_MIGRATIONS_TABLE,
      installExtensions: false,
      synchronize: false,
    }).initialize();
    await database.runMigrations({ transaction: 'each' });
    const runner = database.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      // Reconstruct the immediately preceding schema in a transaction rolled back in finally.
      await runner.query('DROP TABLE api_workspace_memberships');
      await runner.query('DROP TABLE api_workspaces');
      const tenantId = randomUUID();
      const emptyTenantId = randomUUID();
      const userId = randomUUID();
      const projectId = randomUUID();
      const chatId = randomUUID();
      await runner.query(
        "INSERT INTO api_tenants(id, slug, name) VALUES ($1::uuid, $1::text, 'Legacy'), ($2::uuid, $2::text, 'Empty')",
        [tenantId, emptyTenantId],
      );
      await runner.query(
        "INSERT INTO api_users(id, tenant_id, email, display_name) VALUES ($1, $2, $3, 'Legacy user')",
        [userId, tenantId, `${userId}@example.test`],
      );
      await runner.query(
        "INSERT INTO api_projects(id, tenant_id, owner_user_id, kind, name) VALUES ($1, $2, $3, 'implicit', 'Legacy chat')",
        [projectId, tenantId, userId],
      );
      await runner.query(
        "INSERT INTO api_conversations(id, project_id, title) VALUES ($1, $2, 'Legacy conversation')",
        [chatId, projectId],
      );
      const before: unknown = await runner.query('SELECT * FROM api_projects WHERE id = $1', [
        projectId,
      ]);
      const chatsBefore: unknown = await runner.query(
        'SELECT * FROM api_conversations WHERE id = $1',
        [chatId],
      );
      const Migration = databaseMigrations.find(
        (entry) => new entry().name === 'CreateWorkspaces1789280000000',
      );
      expect(Migration).toBeDefined();
      await new Migration!().up(runner);
      const memberships = (await runner.query(
        'SELECT id, tenant_id, workspace_id FROM api_users WHERE id = $1',
        [userId],
      )) as { id: string; tenant_id: string; workspace_id: string }[];
      expect(memberships).toEqual([
        { id: userId, tenant_id: tenantId, workspace_id: expect.any(String) as string },
      ]);
      const workspaceId = memberships[0]!.workspace_id;
      expect(
        await runner.query(
          'SELECT tenant_id, slug FROM api_workspaces WHERE tenant_id = $1 OR tenant_id = $2 ORDER BY tenant_id',
          [tenantId, emptyTenantId],
        ),
      ).toEqual([tenantId, emptyTenantId].sort().map((id) => ({ tenant_id: id, slug: 'default' })));
      expect(await runner.query('SELECT * FROM api_projects WHERE id = $1', [projectId])).toEqual(
        before,
      );
      expect(await runner.query('SELECT * FROM api_conversations WHERE id = $1', [chatId])).toEqual(
        chatsBefore,
      );
      const other = (await runner.query('SELECT id FROM api_workspaces WHERE tenant_id = $1', [
        emptyTenantId,
      ])) as { id: string }[];
      await rejectsConstraint(
        runner,
        'UPDATE api_users SET workspace_id = NULL WHERE id = $1',
        [userId],
        '23502',
      );
      await rejectsConstraint(
        runner,
        'UPDATE api_users SET workspace_id = $1 WHERE id = $2',
        [other[0]!.id, userId],
        '23503',
      );
      await rejectsConstraint(
        runner,
        'DELETE FROM api_workspaces WHERE id = $1',
        [workspaceId],
        '23503',
      );
      await rejectsConstraint(
        runner,
        'UPDATE api_users SET tenant_id = $1 WHERE id = $2',
        [emptyTenantId, userId],
        '23503',
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
      await database.destroy();
    }
  });
});
