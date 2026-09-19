import type { DataSource, EntityManager } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { paginateConversations } from '@api/modules/conversations/infrastructure/persistence/paginate-conversations';
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

vi.mock('@api/modules/conversations/infrastructure/persistence/paginate-conversations', () => ({
  paginateConversations: vi.fn(),
}));

function repositories(
  overrides: {
    readonly projects?: Record<string, unknown>;
    readonly conversations?: Record<string, unknown>;
    readonly query?: ReturnType<typeof vi.fn>;
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
    findOne: vi.fn().mockResolvedValue(conversationRow()),
    save: vi.fn((value: Record<string, unknown>) =>
      Promise.resolve({ ...conversationRow(), ...value }),
    ),
    ...overrides.conversations,
  };
  const getRepository = vi.fn((entity: unknown) =>
    entity === ConversationEntity ? conversations : projects,
  );
  const query = overrides.query ?? vi.fn().mockResolvedValue([]);
  const manager = { getRepository, query } as unknown as EntityManager;
  const dataSource = {
    getRepository,
    transaction: vi.fn((work: (manager: EntityManager) => unknown) => work(manager)),
  } as unknown as DataSource;
  return {
    conversations,
    projects,
    query,
    service: new ConversationsService(dataSource, tenantsService()),
  };
}

describe('ConversationsService', () => {
  beforeEach(() => {
    vi.mocked(paginateConversations).mockResolvedValue({
      items: [conversationRow()],
      nextCursor: null,
    });
  });

  it('renames an owned conversation as a user title without altering its pin', async () => {
    const pinnedAt = new Date('2026-09-10T08:00:00Z');
    const row = conversationRow({ pinnedAt });
    const { service, conversations, projects } = repositories({
      conversations: {
        createQueryBuilder: vi.fn().mockReturnValue(queryBuilder(row)),
        findOne: vi.fn().mockResolvedValue(row),
      },
    });
    expect(await service.update(principal, row.id, { title: 'Nouveau titre' })).toMatchObject({
      title: 'Nouveau titre',
      titleSource: 'user',
      pinnedAt: pinnedAt.toISOString(),
    });
    expect(projects.findOne.mock.invocationCallOrder[0]).toBeLessThan(
      conversations.findOne.mock.invocationCallOrder[0] ?? 0,
    );
    expect(row.title).toBe('Analyse de l’existant');
  });

  it('preserves the timestamp and does not save when already pinned', async () => {
    const row = conversationRow({ pinnedAt: new Date('2026-09-10T08:00:00Z') });
    const { service, conversations } = repositories({
      conversations: {
        createQueryBuilder: vi.fn().mockReturnValue(queryBuilder(row)),
        findOne: vi.fn().mockResolvedValue(row),
      },
    });
    expect(await service.setPinned(principal, row.id, true)).toMatchObject({
      pinnedAt: row.pinnedAt?.toISOString(),
    });
    expect(conversations.save).not.toHaveBeenCalled();
  });

  it('does not rename a conversation that moved while waiting for the parent lock', async () => {
    const row = conversationRow();
    const { service, conversations } = repositories({
      conversations: {
        createQueryBuilder: vi.fn().mockReturnValue(queryBuilder(row)),
        findOne: vi.fn().mockResolvedValue(null),
      },
    });
    await expect(service.update(principal, row.id, { title: 'Lost update' })).rejects.toMatchObject(
      { code: 'conversation_not_found' },
    );
    expect(conversations.save).not.toHaveBeenCalled();
  });

  it('pins then unpins a conversation without mutating the loaded row', async () => {
    const row = conversationRow();
    const { service, conversations } = repositories({
      conversations: {
        createQueryBuilder: vi.fn().mockReturnValue(queryBuilder(row)),
        findOne: vi
          .fn()
          .mockResolvedValueOnce(row)
          .mockResolvedValueOnce({ ...row, pinnedAt: new Date() })
          .mockResolvedValueOnce(row),
      },
    });
    expect(await service.setPinned(principal, row.id, true)).toMatchObject({
      pinnedAt: expect.any(String) as string,
    });
    expect(row.pinnedAt).toBeNull();
    expect(await service.setPinned(principal, row.id, false)).toMatchObject({ pinnedAt: null });
    expect(await service.setPinned(principal, row.id, false)).toMatchObject({ pinnedAt: null });
    expect(conversations.save).toHaveBeenCalledTimes(2);
  });

  it('rejects missing conversations and parents made inactive while waiting', async () => {
    const missing = repositories({
      conversations: { createQueryBuilder: vi.fn().mockReturnValue(queryBuilder(null)) },
    });
    await expect(
      missing.service.setPinned(principal, conversationRow().id, true),
    ).rejects.toMatchObject({ code: 'conversation_not_found' });
    const archived = repositories({
      conversations: {
        createQueryBuilder: vi.fn().mockReturnValue(queryBuilder(conversationRow())),
      },
      projects: { findOne: vi.fn().mockResolvedValue(projectRow({ status: 'archived' })) },
    });
    await expect(
      archived.service.update(principal, conversationRow().id, { title: 'No' }),
    ).rejects.toMatchObject({ code: 'project_archived' });
    expect(archived.conversations.save).not.toHaveBeenCalled();
  });

  it('filters implicit conversations before pagination', async () => {
    const builder = queryBuilder();
    const { service } = repositories({
      conversations: { createQueryBuilder: vi.fn().mockReturnValue(builder) },
    });
    await service.list(principal, { projectKind: 'implicit' });
    expect(builder.andWhere).toHaveBeenCalledWith(expect.stringContaining('kind_project'), {
      projectKind: 'implicit',
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
    expect(paginateConversations).toHaveBeenCalledWith(builder, {
      cursor: undefined,
      limit: 10,
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
      conversations: {
        createQueryBuilder: vi.fn().mockReturnValue(builder),
        findOne: vi.fn().mockResolvedValue(conversationRow({ projectId: 'implicit-1' })),
      },
      projects: {
        findOne: vi.fn().mockResolvedValue(projectRow({ id: 'implicit-1', kind: 'implicit' })),
      },
    });

    await service.remove(principal, conversationRow().id);

    // Parent first, then child: the same order as a cascading project deletion.
    expect(builder.setLock).not.toHaveBeenCalled();
    expect(projects.findOne).toHaveBeenCalledWith({
      lock: { mode: 'pessimistic_write' },
      where: { id: 'implicit-1', ownerUserId: scope.ownerUserId, tenantId: scope.tenantId },
    });
    expect(conversations.findOne).toHaveBeenCalledWith({
      lock: { mode: 'pessimistic_write' },
      where: { id: conversationRow().id, projectId: 'implicit-1' },
    });
    expect(projects.findOne.mock.invocationCallOrder[0]).toBeLessThan(
      conversations.findOne.mock.invocationCallOrder[0] ?? 0,
    );
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

  it('refuses deletion while an execution is active or awaiting recovery after locking its parents', async () => {
    const { conversations, projects, query, service } = repositories({
      conversations: {
        createQueryBuilder: vi.fn().mockReturnValue(queryBuilder(conversationRow())),
      },
      query: vi.fn().mockResolvedValue([{ active: 1 }]),
    });
    await expect(service.remove(principal, conversationRow().id)).rejects.toMatchObject({
      code: 'thread_busy',
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('api_executions'), [
      [conversationRow().id],
      ['pending', 'running', 'stopping'],
      30_000,
    ]);
    expect(conversations.findOne.mock.invocationCallOrder[0]).toBeLessThan(
      query.mock.invocationCallOrder[0] ?? 0,
    );
    expect(conversations.delete).not.toHaveBeenCalled();
    expect(projects.delete).not.toHaveBeenCalled();
  });

  it('answers 404 when the chat vanished while waiting for the project lock', async () => {
    const builder = queryBuilder(conversationRow());
    const { conversations, projects, service } = repositories({
      conversations: {
        createQueryBuilder: vi.fn().mockReturnValue(builder),
        findOne: vi.fn().mockResolvedValue(null),
      },
    });

    await expect(service.remove(principal, conversationRow().id)).rejects.toMatchObject({
      code: 'conversation_not_found',
    });
    expect(conversations.delete).not.toHaveBeenCalled();
    expect(projects.delete).not.toHaveBeenCalled();
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
