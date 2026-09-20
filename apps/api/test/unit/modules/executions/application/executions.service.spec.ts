import { IsNull, type DataSource, type EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { ConversationsService } from '@api/modules/conversations/application/conversations.service';
import { ExecutionsService } from '@api/modules/executions/application/executions.service';
import { ExecutionEntity } from '@api/modules/executions/infrastructure/persistence/execution.entity';
import { MessageEntity } from '@api/modules/executions/infrastructure/persistence/message.entity';
import { RuntimeThreadEntity } from '@api/modules/executions/infrastructure/persistence/runtime-thread.entity';
import {
  conversationRow,
  principal,
  projectRow,
  tenantsService,
} from '../../../../support/project-fixtures';

const submissionId = 'a683ad3e-d304-44d6-a48b-7abed78d8781';
function whereOf(calls: unknown[][]): Record<string, unknown> {
  const argument = calls[0]?.[0] as { where?: Record<string, unknown> } | undefined;
  return argument?.where ?? {};
}
function build(existing?: Partial<ExecutionEntity>) {
  const make = () => ({
    create: vi.fn((x: unknown) => x),
    save: vi.fn((x: object) => Promise.resolve({ id: submissionId, createdAt: new Date(), ...x })),
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    exists: vi.fn().mockResolvedValue(false),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
  });
  const executions = make();
  executions.findOne.mockResolvedValue(existing ?? null);
  const messages = make();
  const threads = make();
  const conversations = make();
  const getRepository = (entity: unknown) =>
    entity === ExecutionEntity
      ? executions
      : entity === MessageEntity
        ? messages
        : entity === RuntimeThreadEntity
          ? threads
          : conversations;
  const query = vi.fn<(sql: string, parameters?: unknown[]) => Promise<unknown>>(() =>
    Promise.resolve([{ total: '0', owned: '0' }]),
  );
  const manager = { getRepository, query } as unknown as EntityManager;
  const transaction = vi.fn((fn: (x: EntityManager) => unknown) => Promise.resolve(fn(manager)));
  const dataSource = { transaction, getRepository } as unknown as DataSource;
  const owner = {
    lockOwned: vi.fn().mockResolvedValue({
      conversation: conversationRow({ titleSource: 'none' }),
      project: projectRow(),
    }),
    get: vi.fn().mockResolvedValue({ id: conversationRow().id }),
  } as unknown as ConversationsService;
  return {
    service: new ExecutionsService(dataSource, tenantsService(), owner),
    executions,
    messages,
    threads,
    conversations,
    query,
  };
}

describe('durable execution commands', () => {
  it('atomically persists immutable dispatch identity, message and fixed deadline without a runtime call', async () => {
    const { service, executions, messages, threads } = build();
    const result = await service.start(principal, conversationRow().id, 'Hello', {
      submissionId,
      profile: 'durable-v1',
    });
    expect(result.execution).toMatchObject({
      submissionId,
      status: 'pending',
      dispatchState: 'pending',
      ownerUserId: principal.id,
    });
    expect(result.execution.invocationId).toBeDefined();
    expect(
      result.execution.deadlineAt.getTime() - result.execution.createdAt.getTime(),
    ).toBeCloseTo(600_000, -2);
    expect(messages.save).toHaveBeenCalledOnce();
    expect(threads.save).toHaveBeenCalledOnce();
    expect(executions.update).not.toHaveBeenCalled();
  });
  it('same submission and payload returns the existing execution without another user turn', async () => {
    const first = build();
    const started = await first.service.start(principal, conversationRow().id, 'Hello', {
      submissionId,
      profile: 'durable-v1',
    });
    const { service, messages, executions } = build(started.execution);
    const replay = await service.start(principal, conversationRow().id, 'Hello', {
      submissionId,
      profile: 'durable-v1',
    });
    expect(replay.execution.id).toBe(started.execution.id);
    expect(messages.save).not.toHaveBeenCalled();
    expect(executions.exists).not.toHaveBeenCalled();
  });
  it('rejects a changed payload for a persisted submission identity', async () => {
    const { service, messages } = build({
      submissionId,
      submissionHash: 'different',
      ownerUserId: principal.id,
      responseProfile: 'durable-v1',
    });
    await expect(
      service.start(principal, conversationRow().id, 'Changed', {
        submissionId,
        profile: 'durable-v1',
      }),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    expect(messages.save).not.toHaveBeenCalled();
  });
  it('refuses a replacement while an execution is genuinely advancing', async () => {
    const { service, executions } = build();
    executions.find.mockResolvedValue([
      {
        id: 'busy',
        status: 'running',
        finishedAt: null,
        deadlineAt: new Date(Date.now() + 60_000),
        updatedAt: new Date(),
        stopRequestedAt: null,
      },
    ]);
    await expect(
      service.start(principal, conversationRow().id, 'Hello', {
        submissionId,
        profile: 'durable-v1',
      }),
    ).rejects.toMatchObject({ code: 'thread_busy' });
    expect(executions.update).not.toHaveBeenCalled();
    expect(executions.find).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });
  it.each([
    ['interrupted', new Date(Date.now() + 60_000), new Date()],
    ['recovery_required', new Date(Date.now() + 60_000), new Date()],
    ['recovering', new Date(Date.now() + 60_000), new Date(Date.now() - 60_000)],
    ['running', new Date(Date.now() - 1), new Date()],
  ] as const)(
    'supersedes a parked or stalled %s execution before creating the replacement',
    async (status, deadlineAt, updatedAt) => {
      const { service, executions, messages } = build();
      executions.find.mockResolvedValue([
        { id: 'stale', status, finishedAt: null, deadlineAt, updatedAt, stopRequestedAt: null },
      ]);
      const started = await service.start(principal, conversationRow().id, 'Next', {
        submissionId,
        profile: 'durable-v1',
      });
      expect(executions.update).toHaveBeenCalledWith(
        { id: 'stale' },
        expect.objectContaining({ status: 'cancelled', error: 'superseded' }),
      );
      const [, changes] = executions.update.mock.calls[0] as [unknown, { finishedAt: Date }];
      expect(changes.finishedAt).toBeInstanceOf(Date);
      expect(started.execution.status).toBe('pending');
      expect(messages.save).toHaveBeenCalledOnce();
    },
  );
  it('looks only at unsettled work when admitting a message and counting quota', async () => {
    const { service, executions, query } = build();
    await service.start(principal, conversationRow().id, 'Hello', {
      submissionId,
      profile: 'durable-v1',
    });
    expect(whereOf(executions.find.mock.calls).finishedAt).toEqual(IsNull());
    const admission = query.mock.calls.find(([sql]) => sql.includes('count(*)'));
    expect(admission?.[0]).toContain('"finished_at" IS NULL');
  });
  it('discovers only active work whose native end is not confirmed', async () => {
    const { service, executions } = build();
    await service.active(principal, conversationRow().id);
    expect(whereOf(executions.findOne.mock.calls).finishedAt).toEqual(IsNull());
  });
});
