import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { WorkspacesService } from '@api/modules/workspaces/application/workspaces.service';

function fixture(result: unknown) {
  const findOne = vi.fn().mockResolvedValue(result);
  const manager = { getRepository: vi.fn(() => ({ findOne })) } as unknown as EntityManager;
  return { findOne, manager, service: new WorkspacesService(manager as unknown as DataSource) };
}

describe('WorkspacesService', () => {
  it('resolves bootstrap membership inside the supplied transaction and tenant', async () => {
    const { service, manager, findOne } = fixture({ id: 'workspace' });
    await expect(service.defaultWorkspaceId(manager, 'tenant')).resolves.toBe('workspace');
    expect(findOne).toHaveBeenNthCalledWith(1, {
      lock: { mode: 'pessimistic_read' },
      select: { id: true },
      where: { id: 'tenant', status: 'active' },
    });
    expect(findOne).toHaveBeenNthCalledWith(2, {
      lock: { mode: 'pessimistic_read' },
      select: { id: true },
      where: { tenantId: 'tenant', slug: 'default', status: 'active' },
    });
  });
  it('fails closed when the default workspace is missing or archived', async () => {
    const { service, manager, findOne } = fixture(null);
    findOne.mockResolvedValueOnce({ id: 'tenant' });
    await expect(service.defaultWorkspaceId(manager, 'tenant')).rejects.toThrow(
      'not been bootstrapped',
    );
  });
  it('returns only public tenant and workspace names for the authenticated user', async () => {
    const { service, findOne } = fixture({
      tenantId: 'tenant',
      tenant: { id: 'tenant', name: 'Org' },
      workspaceMemberships: [
        {
          tenantId: 'tenant',
          workspace: {
            id: 'workspace',
            tenantId: 'tenant',
            status: 'active',
            name: 'Team',
            secret: 'hidden',
          },
        },
        {
          tenantId: 'tenant',
          workspace: { id: 'second', tenantId: 'tenant', status: 'active', name: 'Second' },
        },
      ],
    });
    await expect(service.currentFor('user')).resolves.toEqual({
      tenant: { id: 'tenant', name: 'Org' },
      workspaces: [
        { id: 'second', name: 'Second' },
        { id: 'workspace', name: 'Team' },
      ],
    });
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'user',
          status: 'active',
        },
      }),
    );
  });
  it('keeps the same alphabetical order and breaks equal names by ID regardless of storage order', async () => {
    const teams = [
      { id: 'z', name: 'Finance' },
      { id: 'b', name: 'Alpha' },
      { id: 'a', name: 'Alpha' },
    ];
    for (const order of [teams, teams.toReversed()]) {
      const { service } = fixture({
        tenantId: 'tenant',
        tenant: { id: 'tenant', name: 'Org' },
        workspaceMemberships: order.map((workspace) => ({
          tenantId: 'tenant',
          workspace: { ...workspace, tenantId: 'tenant', status: 'active' },
        })),
      });
      expect((await service.currentFor('user')).workspaces).toEqual([
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Alpha' },
        { id: 'z', name: 'Finance' },
      ]);
    }
  });
  it('omits archived workspaces and tolerates an empty set without granting access', async () => {
    const { service } = fixture({
      tenantId: 'tenant',
      tenant: { id: 'tenant', name: 'Org' },
      workspaceMemberships: [
        {
          tenantId: 'tenant',
          workspace: { id: 'archived', tenantId: 'tenant', status: 'archived' },
        },
      ],
    });
    await expect(service.currentFor('user')).resolves.toEqual({
      tenant: { id: 'tenant', name: 'Org' },
      workspaces: [],
    });
  });
  it('rejects an unavailable user as unauthorized', async () => {
    await expect(fixture(null).service.currentFor('user')).rejects.toThrow(UnauthorizedException);
  });
  it('does not introduce endpoint-specific suspension for the tenant', async () => {
    const { service, findOne } = fixture({
      tenantId: 'tenant',
      tenant: { id: 'tenant', name: 'Org', status: 'suspended' },
      workspaceMemberships: [],
    });
    await expect(service.currentFor('user')).resolves.toEqual({
      tenant: { id: 'tenant', name: 'Org' },
      workspaces: [],
    });
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user', status: 'active' } }),
    );
  });
  it.each([
    {
      tenantId: 'tenant',
      workspaceMemberships: [{ tenantId: 'tenant', workspace: { tenantId: 'other' } }],
    },
    {
      tenantId: 'tenant',
      workspaceMemberships: [{ tenantId: 'other', workspace: { tenantId: 'tenant' } }],
    },
  ])(
    'classifies corrupt membership as an internal failure without exposing identifiers',
    async (result) => {
      const request = fixture(result).service.currentFor('user');
      await expect(request).rejects.toThrow(InternalServerErrorException);
      await expect(request).rejects.toMatchObject({ message: 'Internal Server Error' });
    },
  );
});
