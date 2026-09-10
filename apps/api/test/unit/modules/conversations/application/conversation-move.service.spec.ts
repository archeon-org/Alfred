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
  const conversations = {
    findOne: vi.fn().mockResolvedValue(row),
    countBy: vi.fn().mockResolvedValue(1),
  };
  const projects = {
    existsBy: vi.fn().mockResolvedValue(false),
    findOne: vi.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve([source, target].find(({ id }) => id === where.id) ?? null),
    ),
  };
  const manager = {
    getRepository: (entity: unknown) => (entity === ConversationEntity ? conversations : projects),
  } as unknown as EntityManager;
  const db = {
    transaction: (work: (manager: EntityManager) => unknown) => work(manager),
  } as unknown as DataSource;
  return { service: new ConversationMoveService(db, tenantsService()), projects, row };
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
});
