import { z } from 'zod';
import type { DataSource, EntityManager } from 'typeorm';
import { TenantEntity } from '../../tenants/tenant.entity';
import { UserEntity } from '../../users/user.entity';
import { WorkspaceEntity } from '../infrastructure/workspace.entity';

import { WorkspaceMembershipEntity } from '../infrastructure/workspace-membership.entity';
import { WorkspaceCommandError } from './workspace-command-error';
import { DEFAULT_WORKSPACE_SLUG } from './workspace.constants';

const uuid = z.uuid();
const name = z.string().trim().min(1).max(160);
const commandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    tenantId: uuid,
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    name,
  }),
  z.object({ action: z.literal('rename'), tenantId: uuid, workspaceId: uuid, name }),
  z.object({ action: z.literal('assign'), tenantId: uuid, workspaceId: uuid, userId: uuid }),
  z.object({ action: z.literal('unassign'), tenantId: uuid, workspaceId: uuid, userId: uuid }),
  z.object({ action: z.literal('archive'), tenantId: uuid, workspaceId: uuid }),
]);
export type WorkspaceCommand = z.infer<typeof commandSchema>;

export function parseWorkspaceCommand(args: readonly string[]): WorkspaceCommand {
  const [action, tenantId, target, value] = args;
  if (args.length !== (action === 'archive' ? 3 : 4)) {
    throw new WorkspaceCommandError('WORKSPACE_INVALID_ARGUMENTS');
  }
  return validateCommand(
    action === 'create'
      ? { action, tenantId, slug: target, name: value }
      : action === 'rename'
        ? { action, tenantId, workspaceId: target, name: value }
        : action === 'assign' || action === 'unassign'
          ? { action, tenantId, workspaceId: target, userId: value }
          : { action, tenantId, workspaceId: target },
  );
}

function validateCommand(input: unknown): WorkspaceCommand {
  const result = commandSchema.safeParse(input);
  if (!result.success) throw new WorkspaceCommandError('WORKSPACE_INVALID_ARGUMENTS');
  return result.data;
}

/** Operator-only database command. Affiliation never changes project or conversation ownership. */
export async function provisionWorkspace(
  source: DataSource,
  input: WorkspaceCommand,
): Promise<string> {
  const command = validateCommand(input);
  return source.transaction(async (manager) => {
    const tenant = await manager.getRepository(TenantEntity).findOne({
      lock: { mode: 'pessimistic_write' },
      where: { id: command.tenantId, status: 'active' },
    });
    if (tenant === null) throw new WorkspaceCommandError('WORKSPACE_TENANT_UNAVAILABLE');
    const workspaces = manager.getRepository(WorkspaceEntity);
    if (command.action === 'create') {
      const workspace = await workspaces.save(
        workspaces.create({
          tenantId: command.tenantId,
          slug: command.slug,
          name: command.name,
          status: 'active',
        }),
      );
      return workspace.id;
    }
    const workspace = await workspaces.findOne({
      lock: { mode: 'pessimistic_write' },
      where: { id: command.workspaceId, tenantId: command.tenantId, status: 'active' },
    });
    if (workspace === null) throw new WorkspaceCommandError('WORKSPACE_UNAVAILABLE');
    if (command.action === 'assign' || command.action === 'unassign')
      await changeMembership(manager, workspace, command.userId, command.action);
    else if (command.action === 'rename')
      await workspaces.save(workspaces.create({ ...workspace, name: command.name }));
    else await archiveWorkspace(manager, workspace);
    return workspace.id;
  });
}

async function changeMembership(
  manager: EntityManager,
  workspace: WorkspaceEntity,
  userId: string,
  action: 'assign' | 'unassign',
): Promise<void> {
  const users = manager.getRepository(UserEntity);
  const user = await users.findOne({
    lock: { mode: 'pessimistic_write' },
    where: { id: userId, tenantId: workspace.tenantId },
  });
  if (user === null) throw new WorkspaceCommandError('WORKSPACE_USER_UNAVAILABLE');
  const memberships = manager.getRepository(WorkspaceMembershipEntity);
  const where = { userId: user.id, tenantId: workspace.tenantId, workspaceId: workspace.id };
  const existing = await memberships.findOne({ where });
  if (action === 'assign') {
    if (existing === null) await memberships.insert(where);
    return;
  }
  if (existing === null) return;
  const count = await memberships.count({
    where: { userId: user.id, tenantId: workspace.tenantId },
  });
  if (count <= 1) throw new WorkspaceCommandError('WORKSPACE_LAST_MEMBERSHIP');
  await memberships.delete(where);
}

async function archiveWorkspace(manager: EntityManager, workspace: WorkspaceEntity): Promise<void> {
  if (workspace.slug === DEFAULT_WORKSPACE_SLUG)
    throw new WorkspaceCommandError('WORKSPACE_DEFAULT_ARCHIVE_FORBIDDEN');
  const members = await manager
    .getRepository(WorkspaceMembershipEntity)
    .count({ where: { tenantId: workspace.tenantId, workspaceId: workspace.id } });
  if (members !== 0) throw new WorkspaceCommandError('WORKSPACE_OCCUPIED');
  await manager
    .getRepository(WorkspaceEntity)
    .update({ id: workspace.id, tenantId: workspace.tenantId }, { status: 'archived' });
}
