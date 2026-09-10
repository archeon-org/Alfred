import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { databaseMigrations } from '@api/database/migrations';
import { databaseEntities } from '@api/database/typeorm.options';
import { TenantsService } from '@api/modules/tenants/tenants.service';
import { UsersService } from '@api/modules/users/users.service';
import { provisionWorkspace } from '@api/modules/workspaces/application/workspace-provisioning';
import { WorkspacesService } from '@api/modules/workspaces/application/workspaces.service';
import { addWorkspaceMembership } from '../../../support/workspace.fixture';

const url = process.env.TEST_MIGRATION_DATABASE_URL;
const postgres = url ? describe : describe.skip;

postgres('workspace operator transactions', () => {
  let database: DataSource;
  const tenantId = randomUUID();
  const userId = randomUUID();
  const enrollmentSubject = randomUUID();
  const enrollmentEmail = `${enrollmentSubject}@example.test`;
  let originalWorkspaceId: string;

  beforeAll(async () => {
    database = await new DataSource({
      type: 'postgres',
      url: url!,
      entities: [...databaseEntities],
      migrations: [...databaseMigrations],
      migrationsTableName: API_MIGRATIONS_TABLE,
      installExtensions: false,
      synchronize: false,
    }).initialize();
    await database.runMigrations({ transaction: 'each' });
    await database.query('INSERT INTO api_tenants(id, slug, name) VALUES ($1, $2, $3)', [
      tenantId,
      tenantId,
      'Operator fixture',
    ]);
    originalWorkspaceId = await provisionWorkspace(database, {
      action: 'create',
      tenantId,
      slug: 'default',
      name: 'Équipe générale',
    });
    await database.query(
      'INSERT INTO api_users(id, tenant_id, email, display_name) VALUES ($1, $2, $3, $4)',
      [userId, tenantId, `${userId}@example.test`, 'Operator fixture'],
    );
    await addWorkspaceMembership(database, tenantId, userId, originalWorkspaceId);
  });

  afterAll(async () => {
    if (!database?.isInitialized) return;
    await database.query('DELETE FROM api_users WHERE tenant_id = $1 OR email = $2', [
      tenantId,
      enrollmentEmail,
    ]);
    await database.query('DELETE FROM api_workspaces WHERE tenant_id = $1', [tenantId]);
    await database.query('DELETE FROM api_tenants WHERE id = $1', [tenantId]);
    await database.destroy();
  });

  it('creates and preserves an affiliation through real verified-account enrollment', async () => {
    const memberships = new WorkspacesService(database);
    const users = new UsersService(database, new TenantsService(database), memberships);
    const identity = {
      avatarUrl: null,
      issuer: 'https://example.test',
      provider: 'google',
      subject: enrollmentSubject,
      email: enrollmentEmail,
      displayName: 'Enrollment fixture',
    };
    const account = await users.upsertVerifiedIdentity(identity);
    const context = await memberships.currentFor(account.id);
    expect(context.workspaces).toHaveLength(1);
    expect(context.tenant.id).toBe(account.tenantId);
    const reconnect = await users.upsertVerifiedIdentity(identity);
    expect(reconnect.id).toBe(account.id);
    expect(await memberships.currentFor(reconnect.id)).toEqual(context);
  });

  it('keeps membership and archive state consistent when assignment and archival are launched together', async () => {
    const workspaceId = await provisionWorkspace(database, {
      action: 'create',
      tenantId,
      slug: 'finance',
      name: 'Finance',
    });
    await provisionWorkspace(database, {
      action: 'rename',
      tenantId,
      workspaceId,
      name: 'Finance Europe',
    });
    const results = await Promise.allSettled([
      provisionWorkspace(database, { action: 'assign', tenantId, workspaceId, userId }),
      provisionWorkspace(database, { action: 'archive', tenantId, workspaceId }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rows = await database.query<{ status: string; name: string; members: number }[]>(
      'SELECT w.status, w.name, (SELECT count(*)::int FROM api_workspace_memberships u WHERE u.workspace_id = w.id) AS members FROM api_workspaces w WHERE w.id = $1',
      [workspaceId],
    );
    expect(rows[0]?.name).toBe('Finance Europe');
    expect(rows[0]).toMatchObject(
      rows[0]?.status === 'archived' ? { members: 0 } : { status: 'active', members: 1 },
    );
    await expect(
      provisionWorkspace(database, {
        action: 'archive',
        tenantId,
        workspaceId: originalWorkspaceId,
      }),
    ).rejects.toThrow('default');
  });

  it('assigns additively and idempotently and refuses removing the final membership concurrently', async () => {
    const workspaceId = await provisionWorkspace(database, {
      action: 'create',
      tenantId,
      slug: 'multiple',
      name: 'Multiple',
    });
    await Promise.all([
      provisionWorkspace(database, { action: 'assign', tenantId, workspaceId, userId }),
      provisionWorkspace(database, { action: 'assign', tenantId, workspaceId, userId }),
    ]);
    const rows = await database.query<{ workspace_id: string }[]>(
      'SELECT workspace_id FROM api_workspace_memberships WHERE user_id = $1',
      [userId],
    );
    expect(rows.map((row) => row.workspace_id)).toEqual(
      expect.arrayContaining([originalWorkspaceId, workspaceId]),
    );
    expect(rows.filter((row) => row.workspace_id === workspaceId)).toHaveLength(1);
    // Remove any membership retained by the assignment/archive race above first.
    for (const row of rows) {
      if (![originalWorkspaceId, workspaceId].includes(row.workspace_id)) {
        await provisionWorkspace(database, {
          action: 'unassign',
          tenantId,
          workspaceId: row.workspace_id,
          userId,
        });
      }
    }
    const removals = await Promise.allSettled([
      provisionWorkspace(database, { action: 'unassign', tenantId, workspaceId, userId }),
      provisionWorkspace(database, {
        action: 'unassign',
        tenantId,
        workspaceId: originalWorkspaceId,
        userId,
      }),
    ]);
    expect(removals.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      await database.query('SELECT user_id FROM api_workspace_memberships WHERE user_id = $1', [
        userId,
      ]),
    ).toEqual([{ user_id: userId }]);
  });
});
