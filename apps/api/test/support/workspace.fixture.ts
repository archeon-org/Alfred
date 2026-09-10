import type { DataSource } from 'typeorm';

export async function defaultWorkspace(database: DataSource, tenantId: string): Promise<string> {
  const rows = await database.query<{ id: string }[]>(
    `INSERT INTO api_workspaces (tenant_id, slug, name) VALUES ($1, 'default', 'Équipe générale')
     ON CONFLICT (tenant_id, slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`,
    [tenantId],
  );
  return rows[0]!.id;
}

export async function removeTenantWorkspaces(
  database: DataSource,
  tenantId: string,
): Promise<void> {
  await database.query('DELETE FROM api_workspaces WHERE tenant_id = $1', [tenantId]);
}

export async function addWorkspaceMembership(
  database: DataSource,
  tenantId: string,
  userId: string,
  workspaceId?: string,
): Promise<void> {
  await database.query(
    'INSERT INTO api_workspace_memberships (tenant_id, user_id, workspace_id) VALUES ($1, $2, $3)',
    [tenantId, userId, workspaceId ?? (await defaultWorkspace(database, tenantId))],
  );
}
