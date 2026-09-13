import type { Conversation, ExecutionStreamEvent } from '@alfred/contracts';
import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import type { ConversationsService } from '@api/modules/conversations/application/conversations.service';
import { ConversationEntity } from '@api/modules/conversations/infrastructure/persistence/conversation.entity';
import {
  ExecutionsService,
  type StartedExecution,
} from '@api/modules/executions/application/executions.service';
import { ABANDONED_EXECUTION_ERROR } from '@api/modules/executions/domain/execution';
import type {
  GeneratedTitle,
  RuntimeClient,
} from '@api/modules/executions/application/runtime-client.port';
import { ExecutionEntity } from '@api/modules/executions/infrastructure/persistence/execution.entity';
import { MessageEntity } from '@api/modules/executions/infrastructure/persistence/message.entity';
import { RuntimeThreadEntity } from '@api/modules/executions/infrastructure/persistence/runtime-thread.entity';
import {
  conversationRow,
  principal,
  projectRow,
  tenantsService,
} from '../../../../support/project-fixtures';

const CONVERSATION_ID = conversationRow().id;
const EXECUTION_ID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';

function executionRow(overrides: Partial<ExecutionEntity> = {}): ExecutionEntity {
  return {
    conversation: undefined as unknown as ConversationEntity,
    conversationId: CONVERSATION_ID,
    createdAt: new Date('2026-09-11T09:00:00.000Z'),
    error: null,
    finishedAt: null,
    id: EXECUTION_ID,
    runtimeRunId: null,
    runtimeThreadId: null,
    startedAt: null,
    status: 'pending',
    updatedAt: new Date('2026-09-11T09:00:00.000Z'),
    ...overrides,
  };
}

function conversationDto(overrides: Partial<Conversation> = {}): Conversation {
  return {
    archivedAt: null,
    createdAt: '2026-09-09T12:00:00.000Z',
    id: CONVERSATION_ID,
    lastActivityAt: '2026-09-11T09:00:00.000Z',
    pinnedAt: null,
    projectId: projectRow().id,
    projectKind: 'named',
    title: 'Explique-moi Kafka',
    titleSource: 'auto',
    updatedAt: '2026-09-09T12:00:00.000Z',
    ...overrides,
  };
}

function repository(overrides: Record<string, unknown> = {}) {
  return {
    create: vi.fn((value: unknown) => value),
    exists: vi.fn().mockResolvedValue(false),
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    save: vi.fn((value: Record<string, unknown>) =>
      Promise.resolve({ id: EXECUTION_ID, ...value }),
    ),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  };
}

type StreamOptions = Parameters<RuntimeClient['stream']>[2];

interface RuntimeOptions {
  readonly events?: readonly ExecutionStreamEvent[];
  readonly failure?: Error;
  readonly title?: GeneratedTitle | null | Error;
  /** Resolved by the test to release the title answer at a chosen moment. */
  readonly titleGate?: Promise<void>;
}

function runtime({ events = [], failure, title = null, titleGate }: RuntimeOptions = {}) {
  const createThread = vi.fn().mockResolvedValue({ threadId: 'thread-1' });
  const stream = vi.fn(async function* (_thread: string, _input: unknown, options: StreamOptions) {
    options.onRunCreated?.('run-1');
    for (const event of events) {
      await Promise.resolve();
      if (options.signal.aborted) throw new Error('aborted');
      yield event;
    }
    if (failure !== undefined) throw failure;
  });
  const generateTitle = vi.fn(async () => {
    await (titleGate ?? Promise.resolve());
    if (title instanceof Error) throw title;
    return title;
  });
  const cancel = vi.fn().mockResolvedValue(undefined);
  const client: RuntimeClient = { cancel, createThread, generateTitle, stream };
  return { cancel, client, createThread, generateTitle, stream };
}

type RuntimeDouble = ReturnType<typeof runtime>;

function build(
  options: {
    readonly conversation?: Partial<ConversationEntity>;
    readonly conversations?: Record<string, unknown>;
    readonly executions?: Record<string, unknown>;
    readonly threads?: Record<string, unknown>;
    readonly runtime?: RuntimeDouble;
  } = {},
) {
  const repositories = {
    conversations: repository(options.conversations),
    executions: repository(options.executions),
    messages: repository(),
    threads: repository(options.threads),
  };
  const getRepository = vi.fn((entity: unknown) => {
    if (entity === ExecutionEntity) return repositories.executions;
    if (entity === MessageEntity) return repositories.messages;
    if (entity === RuntimeThreadEntity) return repositories.threads;
    if (entity === ConversationEntity) return repositories.conversations;
    throw new Error('Unexpected repository');
  });
  const manager = { getRepository } as unknown as EntityManager;
  const transaction = vi.fn((work: (manager: EntityManager) => unknown) => work(manager));
  const dataSource = { getRepository, transaction } as unknown as DataSource;
  const row = conversationRow(options.conversation);
  const get = vi.fn().mockResolvedValue({ id: row.id });
  const lockOwned = vi.fn().mockResolvedValue({ conversation: row, project: projectRow() });
  const conversations = { get, lockOwned } as unknown as ConversationsService;
  const double = options.runtime ?? runtime();
  const service = new ExecutionsService(dataSource, tenantsService(), conversations, double.client);
  return { ...double, get, lockOwned, repositories, service, transaction };
}

async function collect(events: AsyncIterable<ExecutionStreamEvent>) {
  const collected: ExecutionStreamEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

function started(overrides: Partial<StartedExecution> = {}): StartedExecution {
  return {
    conversation: conversationDto(),
    execution: executionRow(),
    message: 'Salut',
    titleRequested: false,
    ...overrides,
  };
}

describe('ExecutionsService.start', () => {
  it('records the execution, the user turn and a provisional title before any dispatch', async () => {
    const { service, repositories, lockOwned, stream } = build({
      conversation: { title: 'Nouvelle conversation', titleSource: 'none' },
    });
    const result = await service.start(principal, CONVERSATION_ID, 'Explique-moi Kafka\nvite');

    expect(lockOwned).toHaveBeenCalledOnce();
    expect(result.execution).toMatchObject({ conversationId: CONVERSATION_ID, status: 'pending' });
    expect(result.titleRequested).toBe(true);
    expect(result.conversation).toMatchObject({
      id: CONVERSATION_ID,
      projectKind: 'named',
      title: 'Explique-moi Kafka',
      titleSource: 'auto',
    });
    expect(result.conversation.lastActivityAt).not.toBeNull();
    expect(repositories.messages.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', content: 'Explique-moi Kafka\nvite' }),
    );
    expect(repositories.conversations.update).toHaveBeenCalledWith(
      { id: CONVERSATION_ID },
      expect.objectContaining({ title: 'Explique-moi Kafka', titleSource: 'auto' }),
    );
    expect(stream).not.toHaveBeenCalled();
  });

  it('keeps a user-chosen title and does not request one', async () => {
    const { service, repositories } = build({ conversation: { titleSource: 'user' } });
    const result = await service.start(principal, CONVERSATION_ID, 'Bonjour');
    const changes: unknown = repositories.conversations.update.mock.calls[0]?.[1];
    expect(changes).not.toHaveProperty('title');
    expect(changes).toHaveProperty('lastActivityAt');
    expect(result.titleRequested).toBe(false);
    expect(result.conversation.title).toBe('Analyse de l’existant');
  });

  it('refuses a second execution while one is still answering', async () => {
    const { service, repositories } = build({
      executions: { exists: vi.fn().mockResolvedValue(true) },
    });
    await expect(service.start(principal, CONVERSATION_ID, 'Encore')).rejects.toMatchObject({
      code: 'thread_busy',
    });
    expect(repositories.messages.save).not.toHaveBeenCalled();
  });

  it('closes executions abandoned by a dead process before checking for a busy chat', async () => {
    const { service, repositories } = build();
    await service.start(principal, CONVERSATION_ID, 'Encore');

    const [criteria, changes] = repositories.executions.update.mock.calls[0] as unknown as [
      { readonly conversationId: string; readonly createdAt: unknown; readonly status: unknown },
      Record<string, unknown>,
    ];
    expect(criteria.conversationId).toBe(CONVERSATION_ID);
    expect(criteria.status).toMatchObject({ _type: 'in', _value: ['pending', 'running'] });
    expect(criteria.createdAt).toMatchObject({ _type: 'lessThan' });
    expect(changes).toMatchObject({ error: ABANDONED_EXECUTION_ERROR, status: 'failed' });
    expect(repositories.executions.update.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.executions.exists.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('refuses an archived conversation', async () => {
    const { service } = build({ conversation: { archivedAt: new Date() } });
    await expect(service.start(principal, CONVERSATION_ID, 'Encore')).rejects.toMatchObject({
      code: 'conversation_archived',
    });
  });
});

describe('ExecutionsService.stream', () => {
  const nativeEvents: readonly ExecutionStreamEvent[] = [
    { data: { run_id: 'run-1' }, event: 'metadata' },
    { data: [{ content: 'Bon', id: 'ai-1', type: 'AIMessageChunk' }], event: 'messages/partial' },
    { data: [{ content: 'Bonjour !', id: 'ai-1', type: 'ai' }], event: 'messages/complete' },
    { data: { agent: {} }, event: 'updates' },
  ];

  it('pushes the conversation view, relays native events and stores the assistant turn', async () => {
    const { service, repositories, createThread, stream, generateTitle, cancel, transaction } =
      build({ runtime: runtime({ events: nativeEvents }) });

    const events = await collect(service.stream(started(), new AbortController().signal));

    expect(createThread).toHaveBeenCalledWith({ conversationId: CONVERSATION_ID });
    expect(repositories.threads.save).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: CONVERSATION_ID, threadId: 'thread-1' }),
    );
    const [thread, input, options] = stream.mock.calls[0] as unknown as [
      string,
      unknown,
      StreamOptions,
    ];
    expect(thread).toBe('thread-1');
    expect(input).toEqual({ messages: [{ content: 'Salut', role: 'user' }] });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(events.map((event) => event.event)).toEqual([
      'conversation',
      'execution',
      'metadata',
      'messages/partial',
      'messages/complete',
      'updates',
      'execution',
    ]);
    expect(events[0]?.data).toMatchObject({ id: CONVERSATION_ID, title: 'Explique-moi Kafka' });
    expect(events[1]?.data).toMatchObject({ status: 'running', id: EXECUTION_ID });
    expect(events.at(-1)?.data).toMatchObject({ status: 'completed', error: null });
    expect(events.at(-1)?.data).not.toHaveProperty('runtimeThreadId');
    expect(generateTitle).not.toHaveBeenCalled();
    expect(repositories.messages.save).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        content: 'Bonjour !',
        executionId: EXECUTION_ID,
      }),
    );
    expect(repositories.executions.update).toHaveBeenLastCalledWith(
      { id: EXECUTION_ID },
      expect.objectContaining({ status: 'completed', runtimeRunId: 'run-1' }),
    );
    // The assistant turn and the terminal state are written by the same transaction.
    expect(transaction).toHaveBeenCalledOnce();
    const inside = transaction.mock.invocationCallOrder[0] ?? 0;
    expect(repositories.messages.save.mock.invocationCallOrder[0]).toBeGreaterThan(inside);
    expect(repositories.executions.update.mock.invocationCallOrder.at(-1)).toBeGreaterThan(inside);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('reports a failed store once, without a duplicate answer or a thrown error', async () => {
    const { service, repositories } = build({
      executions: {
        update: vi
          .fn()
          .mockResolvedValueOnce({ affected: 1 })
          .mockRejectedValueOnce(new Error('connection lost')),
      },
      runtime: runtime({ events: nativeEvents }),
    });
    const events = await collect(service.stream(started(), new AbortController().signal));
    expect(events.at(-1)?.data).toMatchObject({
      error: 'The answer could not be stored.',
      status: 'failed',
    });
    expect(repositories.messages.save).toHaveBeenCalledOnce();
    expect(repositories.executions.update).toHaveBeenCalledTimes(2);
  });

  it('reuses the bound runtime thread of the conversation', async () => {
    const { service, createThread, stream } = build({
      runtime: runtime(),
      threads: { findOne: vi.fn().mockResolvedValue({ threadId: 'thread-existing' }) },
    });
    await collect(service.stream(started(), new AbortController().signal));
    expect(createThread).not.toHaveBeenCalled();
    expect(stream).toHaveBeenCalledWith('thread-existing', expect.anything(), expect.anything());
  });

  it('ends as failed without throwing when the runtime call breaks', async () => {
    const { service, repositories } = build({
      runtime: runtime({ failure: new Error('connect ECONNREFUSED') }),
    });
    const events = await collect(service.stream(started(), new AbortController().signal));
    expect(events.at(-1)?.data).toMatchObject({
      status: 'failed',
      error: 'connect ECONNREFUSED',
    });
    expect(repositories.messages.save).not.toHaveBeenCalled();
  });

  it('marks a native error event as a failed execution', async () => {
    const { service } = build({
      runtime: runtime({
        events: [{ data: { error: 'ValueError', message: 'boom' }, event: 'error' }],
      }),
    });
    const events = await collect(service.stream(started(), new AbortController().signal));
    expect(events.map((event) => event.event)).toEqual([
      'conversation',
      'execution',
      'error',
      'execution',
    ]);
    expect(events.at(-1)?.data).toMatchObject({ status: 'failed', error: 'boom' });
  });

  it('marks the execution cancelled and keeps the partial answer when the client leaves', async () => {
    const abort = new AbortController();
    const { service, repositories, cancel } = build({
      runtime: runtime({
        events: [
          {
            data: [{ content: 'Partiel', id: 'ai-1', type: 'AIMessageChunk' }],
            event: 'messages/partial',
          },
          { data: {}, event: 'updates' },
        ],
      }),
    });
    const events: ExecutionStreamEvent[] = [];
    for await (const event of service.stream(started(), abort.signal)) {
      events.push(event);
      if (event.event === 'messages/partial') abort.abort();
    }
    expect(events.at(-1)?.data).toMatchObject({ status: 'cancelled', error: null });
    expect(repositories.messages.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'assistant', content: 'Partiel' }),
    );
    expect(cancel).toHaveBeenCalledWith('thread-1', 'run-1');
  });

  it('still records the cancellation when the runtime refuses to cancel', async () => {
    const abort = new AbortController();
    const double = runtime({ events: [{ data: {}, event: 'updates' }] });
    double.cancel.mockRejectedValue(new Error('run already finished'));
    const { service } = build({ runtime: double });
    const events: ExecutionStreamEvent[] = [];
    for await (const event of service.stream(started(), abort.signal)) {
      events.push(event);
      if (event.event === 'updates') abort.abort();
    }
    expect(events.at(-1)?.data).toMatchObject({ status: 'cancelled' });
  });
});

describe('ExecutionsService.stream title generation', () => {
  const events: readonly ExecutionStreamEvent[] = [
    { data: {}, event: 'updates' },
    { data: {}, event: 'updates' },
  ];

  it('stores the graph title, guards against a user rename and pushes the new view', async () => {
    const { service, repositories, generateTitle } = build({
      runtime: runtime({ events, title: { language: 'fr', title: '  “Kafka : cas d’usage”  ' } }),
    });
    const collected = await collect(
      service.stream(started({ titleRequested: true }), new AbortController().signal),
    );

    const [titleMessage, titleOptions] = generateTitle.mock.calls[0] as unknown as [
      string,
      { readonly signal: AbortSignal },
    ];
    expect(titleMessage).toBe('Salut');
    expect(titleOptions.signal).toBeInstanceOf(AbortSignal);
    const [criteria, changes] = repositories.conversations.update.mock.calls[0] as unknown as [
      { readonly id: string; readonly titleSource: unknown },
      unknown,
    ];
    expect(criteria.id).toBe(CONVERSATION_ID);
    expect(criteria.titleSource).toMatchObject({ _type: 'not', _value: 'user' });
    expect(changes).toEqual({ title: 'Kafka : cas d’usage', titleSource: 'auto' });
    const views = collected.filter((event) => event.event === 'conversation');
    expect(views).toHaveLength(2);
    expect(views[1]?.data).toMatchObject({ title: 'Kafka : cas d’usage', titleSource: 'auto' });
    expect(collected.filter((event) => event.event === 'execution').at(-1)?.data).toMatchObject({
      status: 'completed',
    });
  });

  it('ends the execution before a slow title graph answers', async () => {
    let releaseTitle = () => undefined as void;
    const titleGate = new Promise<void>((resolve) => {
      releaseTitle = resolve;
    });
    const { service } = build({
      runtime: runtime({ events, title: { language: 'fr', title: 'Tardif' }, titleGate }),
    });
    const collected: ExecutionStreamEvent[] = [];
    for await (const event of service.stream(
      started({ titleRequested: true }),
      new AbortController().signal,
    )) {
      collected.push(event);
      const terminal =
        event.event === 'execution' && (event.data as { status: string }).status === 'completed';
      if (terminal) releaseTitle();
    }
    expect(collected.map((event) => event.event).slice(-2)).toEqual(['execution', 'conversation']);
    expect(collected.at(-1)?.data).toMatchObject({ title: 'Tardif' });
  });

  it('keeps the provisional title when the user renamed the chat meanwhile', async () => {
    const { service } = build({
      conversations: { update: vi.fn().mockResolvedValue({ affected: 0 }) },
      runtime: runtime({ events, title: { language: 'fr', title: 'Trop tard' } }),
    });
    const collected = await collect(
      service.stream(started({ titleRequested: true }), new AbortController().signal),
    );
    expect(collected.filter((event) => event.event === 'conversation')).toHaveLength(1);
  });

  it.each([
    ['the graph fallback', { language: null, title: 'New Conversation' }],
    ['an empty answer', { language: 'fr', title: '"  "' }],
    ['a disabled graph', null],
    ['a runtime failure', new Error('timeout')],
  ])('ignores %s and leaves the provisional title', async (_label, title) => {
    const { service, repositories } = build({ runtime: runtime({ events, title }) });
    const collected = await collect(
      service.stream(started({ titleRequested: true }), new AbortController().signal),
    );
    expect(collected.filter((event) => event.event === 'conversation')).toHaveLength(1);
    const titleWrites = (repositories.conversations.update.mock.calls as unknown[][]).filter(
      ([, written]) => typeof written === 'object' && written !== null && 'title' in written,
    );
    expect(titleWrites).toEqual([]);
    expect(collected.at(-1)?.data).toMatchObject({ status: 'completed' });
  });
});

describe('ExecutionsService.listMessages', () => {
  it('checks ownership and returns the most recent rows, oldest first', async () => {
    const { service, get, repositories } = build();
    const row = (content: string, createdAt: string) => ({
      content,
      conversationId: CONVERSATION_ID,
      createdAt: new Date(createdAt),
      executionId: EXECUTION_ID,
      id: '1f1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f',
      role: 'user',
    });
    // The store answers newest first so the limit keeps the tail of a long chat.
    repositories.messages.find.mockResolvedValue([
      row('Suite', '2026-09-11T09:05:00.000Z'),
      row('Salut', '2026-09-11T09:00:00.000Z'),
    ]);
    const messages = await service.listMessages(principal, CONVERSATION_ID);
    expect(get).toHaveBeenCalledWith(principal, CONVERSATION_ID);
    expect(repositories.messages.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { createdAt: 'DESC', id: 'DESC' }, take: 500 }),
    );
    expect(messages.map((message) => message.content)).toEqual(['Salut', 'Suite']);
  });
});
