import type { DataSource, EntityManager } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { paginateByCursor } from '@api/common/pagination/paginate';
import { ProjectsService } from '@api/modules/projects/application/projects.service';
import {
  principal,
  projectRow,
  queryBuilder,
  scope,
  tenantsService,
} from '../../../../support/project-fixtures';

vi.mock('@api/common/pagination/paginate', () => ({ paginateByCursor: vi.fn() }));

function repositoryWith(overrides: Record<string, unknown> = {}) {
  return {
    create: vi.fn((value: unknown) => value),
    createQueryBuilder: vi.fn(),
    delete: vi.fn().mockResolvedValue({ affected: 1 }),
    findOne: vi.fn().mockResolvedValue(projectRow()),
    save: vi.fn((value: Record<string, unknown>) => Promise.resolve({ ...projectRow(), ...value })),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  };
}

function serviceWith(repository: ReturnType<typeof repositoryWith>) {
  const manager = {
    getRepository: vi.fn().mockReturnValue(repository),
  } as unknown as EntityManager;
  const transaction = vi.fn((work: (manager: EntityManager) => unknown) => work(manager));
  const dataSource = {
    getRepository: vi.fn().mockReturnValue(repository),
    transaction,
  } as unknown as DataSource;
  return { service: new ProjectsService(dataSource, tenantsService()), transaction };
}

describe('ProjectsService', () => {
  beforeEach(() => {
    vi.mocked(paginateByCursor).mockResolvedValue({ items: [projectRow()], nextCursor: 'next' });
  });

  it('creates a named active project inside the caller scope and hides private identifiers', async () => {
    const repository = repositoryWith();
    const { service } = serviceWith(repository);

    const created = await service.create(principal, {
      context: '   ',
      description: 'Une description',
      name: 'Refonte du portail',
    });

    expect(repository.create).toHaveBeenCalledWith({
      ...scope,
      context: null,
      description: 'Une description',
      kind: 'named',
      name: 'Refonte du portail',
      status: 'active',
    });
    expect(created).toMatchObject({ kind: 'named', name: 'Refonte du portail', status: 'active' });
    expect(created).not.toHaveProperty('tenantId');
    expect(created).not.toHaveProperty('ownerUserId');
    expect(created.createdAt).toBe('2026-09-09T10:00:00.000Z');
  });

  it('lists only named active projects of the caller through cursor pagination', async () => {
    const builder = queryBuilder();
    const repository = repositoryWith({ createQueryBuilder: vi.fn().mockReturnValue(builder) });
    const { service } = serviceWith(repository);

    const page = await service.list(principal, { cursor: 'abc', limit: 5 });

    expect(builder.where).toHaveBeenCalledWith('project.tenantId = :tenantId', {
      tenantId: scope.tenantId,
    });
    expect(builder.andWhere).toHaveBeenCalledWith('project.ownerUserId = :ownerUserId', {
      ownerUserId: scope.ownerUserId,
    });
    expect(builder.andWhere).toHaveBeenCalledWith('project.kind = :kind', { kind: 'named' });
    expect(builder.andWhere).toHaveBeenCalledWith('project.status = :status', { status: 'active' });
    expect(paginateByCursor).toHaveBeenCalledWith(builder, {
      cursor: 'abc',
      limit: 5,
      sortColumn: 'updated_at',
    });
    expect(page.nextCursor).toBe('next');
    expect(page.items[0]).toMatchObject({ id: projectRow().id, name: 'Refonte du portail' });
  });

  it('serves pinned projects in pin order without a cursor and excludes them from the recent list', async () => {
    const pinnedBuilder = queryBuilder([
      projectRow({ pinnedAt: new Date('2026-09-09T12:00:00Z') }),
    ]);
    const pinnedRepository = repositoryWith({
      createQueryBuilder: vi.fn().mockReturnValue(pinnedBuilder),
    });
    const pinned = await serviceWith(pinnedRepository).service.list(principal, { pinned: true });

    expect(pinnedBuilder.andWhere).toHaveBeenCalledWith('project.pinnedAt IS NOT NULL');
    expect(pinnedBuilder.orderBy).toHaveBeenCalledWith('project.pinnedAt', 'ASC');
    expect(pinnedBuilder.addOrderBy).toHaveBeenCalledWith('project.id', 'ASC');
    expect(pinnedBuilder.take).toHaveBeenCalledWith(100);
    expect(paginateByCursor).not.toHaveBeenCalled();
    expect(pinned).toEqual({
      items: [expect.objectContaining({ pinnedAt: '2026-09-09T12:00:00.000Z' })],
      nextCursor: null,
    });

    const recentBuilder = queryBuilder();
    const recentRepository = repositoryWith({
      createQueryBuilder: vi.fn().mockReturnValue(recentBuilder),
    });
    await serviceWith(recentRepository).service.list(principal, { limit: 3, pinned: false });
    expect(recentBuilder.andWhere).toHaveBeenCalledWith('project.pinnedAt IS NULL');
    expect(paginateByCursor).toHaveBeenCalledWith(recentBuilder, {
      cursor: undefined,
      limit: 3,
      sortColumn: 'updated_at',
    });
  });

  it('pins with the database clock, unpins, and leaves an unchanged state untouched', async () => {
    const repository = repositoryWith({
      findOne: vi
        .fn()
        .mockResolvedValueOnce(projectRow())
        .mockResolvedValueOnce(projectRow({ pinnedAt: new Date('2026-09-09T12:00:00Z') })),
    });
    const { service } = serviceWith(repository);

    const pinned = await service.setPinned(principal, projectRow().id, true);

    expect(repository.update).toHaveBeenCalledWith(
      { id: projectRow().id, ownerUserId: scope.ownerUserId, tenantId: scope.tenantId },
      { pinnedAt: expect.any(Function) as () => string },
    );
    expect(pinned.pinnedAt).toBe('2026-09-09T12:00:00.000Z');

    const alreadyPinned = repositoryWith({
      findOne: vi.fn().mockResolvedValue(projectRow({ pinnedAt: new Date() })),
    });
    await serviceWith(alreadyPinned).service.setPinned(principal, projectRow().id, true);
    expect(alreadyPinned.update).not.toHaveBeenCalled();

    const unpin = repositoryWith({
      findOne: vi
        .fn()
        .mockResolvedValueOnce(projectRow({ pinnedAt: new Date() }))
        .mockResolvedValueOnce(projectRow()),
    });
    await serviceWith(unpin).service.setPinned(principal, projectRow().id, false);
    expect(unpin.update).toHaveBeenCalledWith(expect.anything(), { pinnedAt: null });

    const implicit = repositoryWith({
      findOne: vi.fn().mockResolvedValue(projectRow({ kind: 'implicit', name: null })),
    });
    await expect(
      serviceWith(implicit).service.setPinned(principal, projectRow().id, true),
    ).rejects.toMatchObject({ code: 'project_implicit' });
  });

  it('reads a project with tenant, owner and id in one predicate', async () => {
    const repository = repositoryWith();
    const { service } = serviceWith(repository);

    await service.get(principal, projectRow().id);

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: projectRow().id, ownerUserId: scope.ownerUserId, tenantId: scope.tenantId },
    });
  });

  it('returns the same 404 for a missing or foreign project', async () => {
    const repository = repositoryWith({ findOne: vi.fn().mockResolvedValue(null) });
    const { service } = serviceWith(repository);

    await expect(service.get(principal, projectRow().id)).rejects.toMatchObject({
      code: 'project_not_found',
    });
  });

  it('rejects an update without any field before touching the database', async () => {
    const repository = repositoryWith();
    const { service, transaction } = serviceWith(repository);

    await expect(service.update(principal, projectRow().id, {})).rejects.toMatchObject({
      code: 'invalid_update',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('locks the row, clears empty documents and returns the refreshed project', async () => {
    const refreshed = projectRow({ context: null, name: 'Nouveau nom' });
    const repository = repositoryWith({
      findOne: vi.fn().mockResolvedValueOnce(projectRow()).mockResolvedValueOnce(refreshed),
    });
    const { service } = serviceWith(repository);

    const updated = await service.update(principal, projectRow().id, {
      context: '',
      name: 'Nouveau nom',
    });

    expect(repository.findOne).toHaveBeenNthCalledWith(1, {
      lock: { mode: 'pessimistic_write' },
      where: { id: projectRow().id, ownerUserId: scope.ownerUserId, tenantId: scope.tenantId },
    });
    expect(repository.update).toHaveBeenCalledWith(
      { id: projectRow().id, ownerUserId: scope.ownerUserId, tenantId: scope.tenantId },
      { context: null, name: 'Nouveau nom' },
    );
    expect(updated.name).toBe('Nouveau nom');
  });

  it('refuses writes on archived projects and renames of implicit shells', async () => {
    const archived = repositoryWith({
      findOne: vi.fn().mockResolvedValue(projectRow({ status: 'archived' })),
    });
    await expect(
      serviceWith(archived).service.update(principal, projectRow().id, { name: 'x' }),
    ).rejects.toMatchObject({ code: 'project_archived' });

    const implicit = repositoryWith({
      findOne: vi.fn().mockResolvedValue(projectRow({ kind: 'implicit', name: null })),
    });
    await expect(
      serviceWith(implicit).service.update(principal, projectRow().id, { name: 'x' }),
    ).rejects.toMatchObject({ code: 'project_implicit' });
    expect(implicit.update).not.toHaveBeenCalled();
  });

  it('deletes under a row lock with the full ownership predicate', async () => {
    const repository = repositoryWith();
    const { service } = serviceWith(repository);

    await service.remove(principal, projectRow().id);

    expect(repository.findOne).toHaveBeenCalledWith({
      lock: { mode: 'pessimistic_write' },
      where: { id: projectRow().id, ownerUserId: scope.ownerUserId, tenantId: scope.tenantId },
    });
    expect(repository.delete).toHaveBeenCalledWith({
      id: projectRow().id,
      ownerUserId: scope.ownerUserId,
      tenantId: scope.tenantId,
    });
  });
});
