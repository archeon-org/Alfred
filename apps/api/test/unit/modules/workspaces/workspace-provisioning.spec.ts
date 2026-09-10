import { WorkspaceMembershipEntity } from '@api/modules/workspaces/infrastructure/workspace-membership.entity';
import { describe, expect, it } from 'vitest';
import { parseWorkspaceCommand } from '@api/modules/workspaces/application/workspace-provisioning';
import { vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { provisionWorkspace } from '@api/modules/workspaces/application/workspace-provisioning';
import { TenantEntity } from '@api/modules/tenants/tenant.entity';
import { UserEntity } from '@api/modules/users/user.entity';
const tenantId = '5aa72926-314f-48e0-8a90-d32b2ea2f3ed';
const workspaceId = '515bd42f-af42-4f0a-8281-4d07c671fc75';
describe('workspace operator commands', () => {
  it('requires explicit tenant and bounded workspace metadata', () => {
    expect(parseWorkspaceCommand(['create', tenantId, 'team-a', ' Team A '])).toEqual({
      action: 'create',
      tenantId,
      slug: 'team-a',
      name: 'Team A',
    });
    expect(() => parseWorkspaceCommand(['create', tenantId, 'BAD SLUG', 'Team'])).toThrow();
    expect(() => parseWorkspaceCommand(['create', tenantId, 'team', ' '])).toThrow();
    expect(() => parseWorkspaceCommand(['create', tenantId, 'team', 'x'.repeat(161)])).toThrow();
  });
  it('rejects missing, malformed and extra arguments before DB access', () => {
    expect(() => parseWorkspaceCommand(['assign', tenantId, workspaceId])).toThrow();
    expect(() => parseWorkspaceCommand(['archive', 'bad-id', workspaceId])).toThrow();
    expect(() => parseWorkspaceCommand(['archive', tenantId, workspaceId, 'extra'])).toThrow();
  });
});

function operatorFixture(
  options: {
    tenant?: boolean;
    workspace?: boolean;
    user?: boolean;
    slug?: string;
    members?: number;
    existing?: boolean;
  } = {},
) {
  const workspaces = {
    findOne: vi.fn().mockResolvedValue(
      options.workspace === false
        ? null
        : {
            id: workspaceId,
            tenantId,
            slug: options.slug ?? 'team',
            status: 'active',
            name: 'Team',
          },
    ),
    create: vi.fn((value: unknown) => value),
    save: vi.fn().mockResolvedValue({ id: workspaceId }),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
  };
  const users = {
    findOne: vi.fn().mockResolvedValue(options.user === false ? null : { id: 'user' }),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    count: vi.fn().mockResolvedValue(options.members ?? 0),
  };
  const memberships = {
    findOne: vi.fn().mockResolvedValue(options.existing ? { userId: 'user' } : null),
    insert: vi.fn(),
    delete: vi.fn(),
    count: vi.fn().mockResolvedValue(options.members ?? 0),
  };
  const tenants = {
    findOne: vi.fn().mockResolvedValue(options.tenant === false ? null : { id: tenantId }),
  };
  const manager = {
    getRepository: vi.fn((entity: unknown) =>
      entity === TenantEntity
        ? tenants
        : entity === UserEntity
          ? users
          : entity === WorkspaceMembershipEntity
            ? memberships
            : workspaces,
    ),
  };
  const source = {
    transaction: vi.fn(async (work: (value: unknown) => Promise<unknown>) => work(manager)),
  } as unknown as DataSource;
  return { source, workspaces, users, tenants, memberships };
}

describe('workspace provisioning', () => {
  it('creates within an explicit locked active tenant', async () => {
    const { source, workspaces, tenants } = operatorFixture();
    await expect(
      provisionWorkspace(source, { action: 'create', tenantId, slug: 'team', name: 'Team' }),
    ).resolves.toBe(workspaceId);
    expect(tenants.findOne).toHaveBeenCalledWith({
      lock: { mode: 'pessimistic_write' },
      where: { id: tenantId, status: 'active' },
    });
    expect(workspaces.create).toHaveBeenCalledWith({
      tenantId,
      slug: 'team',
      name: 'Team',
      status: 'active',
    });
  });
  it('adds a membership and constrains both user and workspace to the tenant', async () => {
    const { source, users, workspaces, memberships } = operatorFixture();
    await provisionWorkspace(source, { action: 'assign', tenantId, workspaceId, userId: tenantId });
    expect(workspaces.findOne).toHaveBeenCalledWith({
      lock: { mode: 'pessimistic_write' },
      where: { id: workspaceId, tenantId, status: 'active' },
    });
    expect(users.findOne).toHaveBeenCalledWith({
      lock: { mode: 'pessimistic_write' },
      where: { id: tenantId, tenantId },
    });
    expect(memberships.insert).toHaveBeenCalledWith({ userId: 'user', tenantId, workspaceId });
    expect(users.update).not.toHaveBeenCalled();
  });
  it.each([
    { options: { tenant: false }, code: 'WORKSPACE_TENANT_UNAVAILABLE' },
    { options: { workspace: false }, code: 'WORKSPACE_UNAVAILABLE' },
    { options: { user: false }, code: 'WORKSPACE_USER_UNAVAILABLE' },
  ])('rejects missing or cross-tenant affiliation', async ({ options, code }) => {
    const { source, users } = operatorFixture(options);
    await expect(
      provisionWorkspace(source, { action: 'assign', tenantId, workspaceId, userId: tenantId }),
    ).rejects.toMatchObject({ code });
    expect(users.update).not.toHaveBeenCalled();
  });
  it.each([
    { options: { slug: 'default' }, code: 'WORKSPACE_DEFAULT_ARCHIVE_FORBIDDEN' },
    { options: { members: 1 }, code: 'WORKSPACE_OCCUPIED' },
  ])('refuses default or occupied workspace archival', async ({ options, code }) => {
    const { source, workspaces } = operatorFixture(options);
    await expect(
      provisionWorkspace(source, { action: 'archive', tenantId, workspaceId }),
    ).rejects.toMatchObject({ code });
    expect(workspaces.update).not.toHaveBeenCalled();
  });
  it('archives empty custom workspaces', async () => {
    const { source, workspaces } = operatorFixture();
    await provisionWorkspace(source, { action: 'archive', tenantId, workspaceId });
    expect(workspaces.update).toHaveBeenCalledWith(
      { id: workspaceId, tenantId },
      { status: 'archived' },
    );
  });
  it('renames without changing the tenant, slug or members', async () => {
    const { source, workspaces, users } = operatorFixture();
    await provisionWorkspace(source, { action: 'rename', tenantId, workspaceId, name: 'Renamed' });
    expect(workspaces.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: workspaceId, tenantId, slug: 'team', name: 'Renamed' }),
    );
    expect(users.update).not.toHaveBeenCalled();
  });
});

describe('multiple memberships', () => {
  it('keeps assignment idempotent', async () => {
    const { source, memberships } = operatorFixture({ existing: true });
    await provisionWorkspace(source, { action: 'assign', tenantId, workspaceId, userId: tenantId });
    expect(memberships.insert).not.toHaveBeenCalled();
    expect(memberships.delete).not.toHaveBeenCalled();
  });
  it('removes only the selected membership', async () => {
    const { source, memberships } = operatorFixture({ existing: true, members: 2 });
    await provisionWorkspace(source, {
      action: 'unassign',
      tenantId,
      workspaceId,
      userId: tenantId,
    });
    expect(memberships.delete).toHaveBeenCalledWith({ userId: 'user', tenantId, workspaceId });
  });
  it('refuses to remove the last membership', async () => {
    const { source, memberships } = operatorFixture({ existing: true, members: 1 });
    await expect(
      provisionWorkspace(source, { action: 'unassign', tenantId, workspaceId, userId: tenantId }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_LAST_MEMBERSHIP' });
    expect(memberships.delete).not.toHaveBeenCalled();
  });
  it('ignores removal of an absent membership', async () => {
    const { source, memberships } = operatorFixture();
    await provisionWorkspace(source, {
      action: 'unassign',
      tenantId,
      workspaceId,
      userId: tenantId,
    });
    expect(memberships.delete).not.toHaveBeenCalled();
  });
});
