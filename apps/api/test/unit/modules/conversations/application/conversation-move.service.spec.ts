import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { ConversationMoveService } from '@api/modules/conversations/application/conversation-move.service';
import { ConversationEntity } from '@api/modules/conversations/infrastructure/persistence/conversation.entity';
import {
  conversationRow,
  principal,
  projectRow,
  scope,
  tenantsService,
} from '../../../../support/project-fixtures';

function fixture(source = projectRow(), target = source) {
  const row = conversationRow({ projectId: source.id });
  const update = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ affected: 1 }),
  };
  const conversations = {
    createQueryBuilder: vi.fn().mockReturnValue(update),
    findOne: vi.fn().mockResolvedValue(row),
    countBy: vi.fn().mockResolvedValue(1),
  };
  const projects = {
    delete: vi.fn().mockResolvedValue({ affected: 1 }),
    existsBy: vi.fn().mockResolvedValue(false),
    findOne: vi.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve([source, target].find(({ id }) => id === where.id) ?? null),
    ),
  };
  const query = vi.fn().mockResolvedValue([]);
  const manager = {
    getRepository: (entity: unknown) => (entity === ConversationEntity ? conversations : projects),
    query,
  } as unknown as EntityManager;
  const db = {
    transaction: (work: (manager: EntityManager) => unknown) => work(manager),
  } as unknown as DataSource;
  return {
    service: new ConversationMoveService(db, tenantsService()),
    conversations,
    projects,
    query,
    row,
  };
}

describe('conversation move UUID canonicalization', () => {
  it('accepts an uppercase same-target retry and locks the canonical project only once', async () => {
    const { service, projects, row } = fixture();
    expect(
      await service.move(principal, row.id, { projectId: row.projectId.toUpperCase() }),
    ).toMatchObject({ id: row.id, projectId: row.projectId });
    expect(projects.findOne).toHaveBeenCalledExactlyOnceWith({
      lock: { mode: 'pessimistic_write' },
      where: { id: row.projectId, ...scope },
    });
  });

  it('locks source and target in canonical UUID order before rejecting an invalid transition', async () => {
    const source = projectRow({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
    const target = projectRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    const { service, projects, row } = fixture(source, target);
    await expect(
      service.move(principal, row.id, { projectId: target.id.toUpperCase() }),
    ).rejects.toMatchObject({ code: 'conversation_move_not_allowed' });
    expect(projects.findOne.mock.calls.map(([arg]) => arg.where.id)).toEqual([
      target.id,
      source.id,
    ]);
  });

  it('refuses moving an active standalone execution after locking both projects and its conversation', async () => {
    const source = projectRow({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      kind: 'implicit',
      name: null,
      description: null,
    });
    const target = projectRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    const { service, conversations, projects, query, row } = fixture(source, target);
    query.mockResolvedValue([{ active: 1 }]);
    await expect(service.move(principal, row.id, { projectId: target.id })).rejects.toMatchObject({
      code: 'thread_busy',
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('api_executions'), [
      [row.id],
      ['pending', 'running', 'stopping'],
      30_000,
    ]);
    expect(projects.findOne.mock.invocationCallOrder[1]).toBeLessThan(
      conversations.findOne.mock.invocationCallOrder[2] ?? 0,
    );
    expect(conversations.findOne.mock.invocationCallOrder[2]).toBeLessThan(
      query.mock.invocationCallOrder[0] ?? 0,
    );
    expect(conversations.countBy).not.toHaveBeenCalled();
  });

  it('allows an idempotent same-target retry while an execution is active', async () => {
    const { service, query, row } = fixture();
    query.mockResolvedValue([{ active: 1 }]);
    await expect(
      service.move(principal, row.id, { projectId: row.projectId }),
    ).resolves.toMatchObject({ id: row.id });
    expect(query).not.toHaveBeenCalled();
  });
});
