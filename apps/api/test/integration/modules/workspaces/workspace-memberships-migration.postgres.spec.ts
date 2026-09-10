import { randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { databaseMigrations } from '@api/database/migrations';
import { CreateWorkspaces1789280000000 } from '@api/database/migrations/1789280000000-create-workspaces';
import { WorkspaceMemberships1789290000000 } from '@api/database/migrations/1789290000000-workspace-memberships';
import { databaseEntities } from '@api/database/typeorm.options';

const url = process.env.TEST_MIGRATION_DATABASE_URL;
const postgres = url ? describe : describe.skip;

async function rejectsConstraint(
  runner: QueryRunner,
  sql: string,
  values: unknown[],
  constraint: string,
) {
  await runner.query('SAVEPOINT rejected_membership');
  try {
    await expect(runner.query(sql, values)).rejects.toMatchObject({ driverError: { constraint } });
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT rejected_membership');
  }
}

postgres('multiple workspace migration', () => {
  it('preserves the old affiliation and private resources, rejects both cross-tenant forgeries, and guards rollback', async () => {
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
    const migration = new WorkspaceMemberships1789290000000();
    try {
      await migration.down(runner);
      const tenantId = randomUUID();
      const foreignTenantId = randomUUID();
      const workspaceId = randomUUID();
      const secondWorkspaceId = randomUUID();
      const foreignWorkspaceId = randomUUID();
      const userId = randomUUID();
      const projectId = randomUUID();
      const chatId = randomUUID();
      await runner.query(
        "INSERT INTO api_tenants(id, slug, name) VALUES ($1::uuid, $1::text, 'Home'), ($2::uuid, $2::text, 'Foreign')",
        [tenantId, foreignTenantId],
      );
      await runner.query(
        "INSERT INTO api_workspaces(id, tenant_id, slug, name) VALUES ($1, $2, 'custom', 'Existing custom team'), ($3, $2, 'second', 'Second'), ($4, $5, 'foreign', 'Foreign')",
        [workspaceId, tenantId, secondWorkspaceId, foreignWorkspaceId, foreignTenantId],
      );
      await runner.query(
        "INSERT INTO api_users(id, tenant_id, workspace_id, email, display_name) VALUES ($1, $2, $3, $4, 'Existing user')",
        [userId, tenantId, workspaceId, `${userId}@example.test`],
      );
      await runner.query(
        "INSERT INTO api_projects(id, tenant_id, owner_user_id, kind, name) VALUES ($1, $2, $3, 'implicit', 'Personal')",
        [projectId, tenantId, userId],
      );
      await runner.query(
        "INSERT INTO api_conversations(id, project_id, title) VALUES ($1, $2, 'Personal chat')",
        [chatId, projectId],
      );
      const userBefore: unknown = await runner.query(
        'SELECT id, tenant_id, email, created_at, updated_at FROM api_users WHERE id=$1',
        [userId],
      );
      const projectBefore: unknown = await runner.query('SELECT * FROM api_projects WHERE id=$1', [
        projectId,
      ]);
      const chatBefore: unknown = await runner.query(
        'SELECT * FROM api_conversations WHERE id=$1',
        [chatId],
      );
      await migration.up(runner);
      expect(
        await runner.query(
          'SELECT tenant_id, user_id, workspace_id FROM api_workspace_memberships WHERE user_id=$1',
          [userId],
        ),
      ).toEqual([{ tenant_id: tenantId, user_id: userId, workspace_id: workspaceId }]);
      expect(
        await runner.query(
          'SELECT id, tenant_id, email, created_at, updated_at FROM api_users WHERE id=$1',
          [userId],
        ),
      ).toEqual(userBefore);
      expect(await runner.query('SELECT * FROM api_projects WHERE id=$1', [projectId])).toEqual(
        projectBefore,
      );
      expect(await runner.query('SELECT * FROM api_conversations WHERE id=$1', [chatId])).toEqual(
        chatBefore,
      );
      const insert =
        'INSERT INTO api_workspace_memberships(tenant_id, user_id, workspace_id) VALUES ($1, $2, $3)';
      await rejectsConstraint(
        runner,
        insert,
        [tenantId, userId, foreignWorkspaceId],
        'fk_workspace_memberships_workspace',
      );
      await rejectsConstraint(
        runner,
        insert,
        [foreignTenantId, userId, foreignWorkspaceId],
        'fk_workspace_memberships_user',
      );
      await rejectsConstraint(
        runner,
        insert,
        [tenantId, userId, workspaceId],
        'pk_workspace_memberships',
      );
      await rejectsConstraint(
        runner,
        'DELETE FROM api_workspaces WHERE id=$1',
        [workspaceId],
        'fk_workspace_memberships_workspace',
      );
      await runner.query(insert, [tenantId, userId, secondWorkspaceId]);
      expect(
        await runner.query('SELECT user_id FROM api_workspace_memberships WHERE user_id=$1', [
          userId,
        ]),
      ).toHaveLength(2);
      for (const count of [2, 0]) {
        if (count === 0)
          await runner.query('DELETE FROM api_workspace_memberships WHERE user_id=$1', [userId]);
        await runner.query('SAVEPOINT rollback_guard');
        try {
          await expect(migration.down(runner)).rejects.toThrow('exactly one membership per user');
        } finally {
          await runner.query('ROLLBACK TO SAVEPOINT rollback_guard');
        }
        expect(
          await runner.query('SELECT user_id FROM api_workspace_memberships WHERE user_id=$1', [
            userId,
          ]),
        ).toHaveLength(count);
      }
      await runner.query(insert, [tenantId, userId, workspaceId]);
      await migration.down(runner);
      expect(
        await runner.query('SELECT workspace_id FROM api_users WHERE id=$1', [userId]),
      ).toEqual([{ workspace_id: workspaceId }]);
      expect(await runner.query('SELECT * FROM api_projects WHERE id=$1', [projectId])).toEqual(
        projectBefore,
      );
      expect(await runner.query('SELECT * FROM api_conversations WHERE id=$1', [chatId])).toEqual(
        chatBefore,
      );
      await runner.query('SAVEPOINT original_workspace_rollback');
      try {
        await expect(new CreateWorkspaces1789280000000().down(runner)).rejects.toThrow(
          'customized workspace data',
        );
      } finally {
        await runner.query('ROLLBACK TO SAVEPOINT original_workspace_rollback');
      }
      expect(
        await runner.query('SELECT name FROM api_workspaces WHERE id=$1', [workspaceId]),
      ).toEqual([{ name: 'Existing custom team' }]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
      await database.destroy();
    }
  });
});
