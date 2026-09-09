import type { DataSource, EntityManager } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { paginateByCursor } from '@api/common/pagination/paginate';
import { ConversationsService } from '@api/modules/conversations/application/conversations.service';
import { ConversationEntity } from '@api/modules/conversations/infrastructure/persistence/conversation.entity';
import {
  conversationRow,
  principal,
  projectRow,
  queryBuilder,
  scope,
  tenantsService,
} from '../../../../support/project-fixtures';

vi.mock('@api/common/pagination/paginate', () => ({ paginateByCursor: vi.fn() }));

function repositories(
  overrides: {
    readonly projects?: Record<string, unknown>;
    readonly conversations?: Record<string, unknown>;
  } = {},
) {
  const projects = {
    create: vi.fn((value: unknown) => value),
    delete: vi.fn().mockResolvedValue({ affected: 1 }),
    find: vi.fn().mockResolvedValue([{ id: projectRow().id, kind: 'named' }]),
    findOne: vi.fn().mockResolvedValue(projectRow()),
    save: vi.fn((value: Record<string, unknown>) =>
      Promise.resolve({ ...projectRow({ id: 'implicit-1' }), ...value }),
    ),
    ...overrides.projects,
  };
  const conversations = {
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn((value: unknown) => value),
    createQueryBuilder: vi.fn(),
    delete: vi.fn().mockResolvedValue({ affected: 1 }),
    save: vi.fn((value: Record<string, unknown>) =>
      Promise.resolve({ ...conversationRow(), ...value }),
    ),
    ...overrides.conversations,
  };
  const getRepository = vi.fn((entity: unknown) =>
    entity === ConversationEntity ? conversations : projects,
  );
  const manager = { getRepository } as unknown as EntityManager;
  const dataSource = {
    getRepository,
    transaction: vi.fn((work: (manager: EntityManager) => unknown) => work(manager)),
  } as unknown as DataSource;
  return {
    conversations,
    projects,
    service: new ConversationsService(dataSource, tenantsService()),
  };
}

describe('ConversationsService', () => {
  beforeEach(() => {
    vi.mocked(paginateByCursor).mockResolvedValue({
      items: [conversationRow()],
      nextCursor: null,
    });
  });

  it('creates a chat inside a locked, owned, named project with a user-provided title', async () => {
    const { conversations, projects, service } = repositories();

    const created = await service.create(principal, {
      projectId: projectRow().id,
      title: '  Analyse de l’existant  ',
    });

    expect(projects.findOne).toHaveBeenCalledWith({
      lock: { mode: 'pessimistic_write' },
      where: { id: projectRow().id, ownerUserId: scope.ownerUserId, tenantId: scope.tenantId },
    });
    expect(conversations.create).toHaveBeenCalledWith({
      projectId: projectRow().id,
      title: 'Analyse de l’existant',
      titleSource: 'user',
    });
    expect(created).toMatchObject({ projectId: projectRow().id, projectKind: 'named' });
  });

  it('refuses a second chat inside an implicit shell and any chat in an archived project', async () => {
    const implicit = repositories({
      projects: {
        findOne: vi.fn().mockResolvedValue(projectRow({ kind: 'implicit', name: null })),
      },
    });
    await expect(
      implicit.service.create(principal, { projectId: projectRow().id }),
    ).rejects.toMatchObject({ code: 'project_implicit' });

    const archived = repositories({
      projects: { findOne: vi.fn().mockResolvedValue(projectRow({ status: 'archived' })) },
    });
    await expect(
      archived.service.create(principal, { projectId: projectRow().id }),
    ).rejects.toMatchObject({ code: 'project_archived' });
    expect(archived.conversations.save).not.toHaveBeenCalled();
  });

  it('creates a private implicit project and the chat in one transaction for a new chat', async () => {
    const { conversations, projects, service } = repositories();

    const created = await service.create(principal, {});

    expect(projects.create).toHaveBeenCalledWith({
      ...scope,
      context: null,
      description: null,
      kind: 'implicit',
      name: null,
      status: 'active',
    });
    expect(conversations.create).toHaveBeenCalledWith({
      projectId: 'implicit-1',
      title: 'Nouvelle conversation',
      titleSource: 'none',
    });
    expect(created).toMatchObject({ projectKind: 'implicit', titleSource: 'none' });
  });

  it('checks project ownership before listing its chats and paginates the owned query', async () => {
    const builder = queryBuilder();
    const { conversations, projects, service } = repositories({
      conversations: { createQueryBuilder: vi.fn().mockReturnValue(builder) },
    });

    const page = await service.list(principal, { limit: 10, projectId: projectRow().id });

    expect(projects.findOne).toHaveBeenCalledWith({
      where: { id: projectRow().id, ownerUserId: scope.ownerUserId, tenantId: scope.tenantId },
    });
    expect(conversations.createQueryBuilder).toHaveBeenCalledWith('conversation');
    expect(builder.where).toHaveBeenCalledWith(expect.stringContaining('EXISTS'), {
      ownerUserId: scope.ownerUserId,
      tenantId: scope.tenantId,
    });
    expect(builder.andWhere).toHaveBeenCalledWith('conversation.projectId = :projectId', {
      projectId: projectRow().id,
    });
    expect(paginateByCursor).toHaveBeenCalledWith(builder, {
      cursor: undefined,
      limit: 10,
      sortColumn: 'created_at',
    });
    expect(page.items[0]).toMatchObject({ projectKind: 'named', title: 'Analyse de l’existant' });
  });

  it('lists recent chats across projects without a project filter', async () => {
    const builder = queryBuilder();
    const { projects, service } = repositories({
      conversations: { createQueryBuilder: vi.fn().mockReturnValue(builder) },
    });

    await service.list(principal, {});

    expect(projects.findOne).not.toHaveBeenCalled();
    expect(builder.andWhere).not.toHaveBeenCalledWith(
      'conversation.projectId = :projectId',
      expect.anything(),
    );
  });

  it('returns the same 404 for a missing or foreign chat', async () => {
    const builder = queryBuilder(null);
    const { service } = repositories({
      conversations: { createQueryBuilder: vi.fn().mockReturnValue(builder) },
    });

    await expect(service.get(principal, conversationRow().id)).rejects.toMatchObject({
      code: 'conversation_not_found',
    });
  });

  it('removes a chat and the implicit shell that only existed for it', async () => {
    const builder = queryBuilder(conversationRow({ projectId: 'implicit-1' }));
    const { conversations, projects, service } = repositories({
      conversations: { createQueryBuilder: vi.fn().mockReturnValue(builder) },
      projects: {
        findOne: vi.fn().mockResolvedValue(projectRow({ id: 'implicit-1', kind: 'implicit' })),
      },
    });

    await service.remove(principal, conversationRow().id);

    expect(builder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(conversations.delete).toHaveBeenCalledWith({
      id: conversationRow().id,
      projectId: 'implicit-1',
    });
    expect(projects.delete).toHaveBeenCalledWith({
      id: 'implicit-1',
      ownerUserId: scope.ownerUserId,
      tenantId: scope.tenantId,
    });
  });

  it('keeps a named project when one of its chats is removed', async () => {
    const builder = queryBuilder(conversationRow());
    const { projects, service } = repositories({
      conversations: { createQueryBuilder: vi.fn().mockReturnValue(builder) },
    });

    await service.remove(principal, conversationRow().id);

    expect(projects.delete).not.toHaveBeenCalled();
  });
});
