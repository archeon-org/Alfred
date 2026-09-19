import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import {
  applyExecutionDelta,
  EXECUTION_JSON_PROFILE,
  executionDeltaSchema,
  executionSnapshotSchema,
  type ExecutionSnapshot,
} from '@alfred/contracts';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiException } from '@api/common/errors/api.exception';
import type { ConversationsService } from '@api/modules/conversations/application/conversations.service';
import { toConversationDto } from '@api/modules/conversations/domain/conversation';
import { ExecutionObservationService } from '@api/modules/executions/application/execution-observation.service';
import type { ExecutionsService } from '@api/modules/executions/application/executions.service';
import type { RuntimeEvent } from '@api/modules/executions/application/runtime-client.port';
import {
  emptyProjection,
  projectRuntimeEvent,
  projectionText,
} from '@api/modules/executions/infrastructure/langgraph/runtime-projection';
import { ExecutionEntity } from '@api/modules/executions/infrastructure/persistence/execution.entity';
import { ExecutionObserverService } from '@api/modules/stream/application/execution-observer.service';
import type { StreamAuthorityService } from '@api/modules/stream/application/stream-authority.service';
import { conversationRow, principal } from '../../../support/project-fixtures';

// Bind promise-based Node delays to the same clock used by the observer's expiry/heartbeat timers.
vi.mock('node:timers/promises', () => ({
  setTimeout: (ms: number, value: unknown, options?: { signal?: AbortSignal }) =>
    new Promise((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        options?.signal?.removeEventListener('abort', abort);
        reject(new Error('Aborted delay'));
      };
      const timer = setTimeout(() => {
        options?.signal?.removeEventListener('abort', abort);
        resolve(value);
      }, ms);
      options?.signal?.addEventListener('abort', abort, { once: true });
      if (options?.signal?.aborted) abort();
    }),
}));

const invocationId = 'b0326b3c-2f93-4c53-9808-32ac6110892c';
const executionId = 'f9dfb431-2928-42c1-980d-97383a4016bd';
const generation = 'a3094b40-dd66-4759-abd1-14a39c164ad8';
const initialEvent: RuntimeEvent = {
  id: 'source-1',
  event: 'messages',
  data: [{ id: 'native-message', type: 'ai', content: 'Hello' }, {}],
};

class ObserverResponse extends EventEmitter {
  readonly chunks: string[] = [];
  destroyed = false;
  writableEnded = false;
  writableLength = 0;
  readonly status = vi.fn();
  readonly setHeader = vi.fn();
  readonly flushHeaders = vi.fn();
  readonly write = vi.fn((chunk: string) => {
    this.chunks.push(chunk);
    return true;
  });
  readonly end = vi.fn(() => {
    this.writableEnded = true;
  });
  readonly destroy = vi.fn(() => {
    this.destroyed = true;
    this.emit('close');
    return this;
  });
  asExpress(): Response {
    return this as unknown as Response;
  }
  /** Public frames as the browser reconstructs them: snapshots as sent, deltas applied in order. */
  snapshots(): ExecutionSnapshot[] {
    const frames: ExecutionSnapshot[] = [];
    for (const chunk of this.chunks) {
      const data = chunk
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice(6);
      if (chunk.includes('event: snapshot\n')) {
        frames.push(executionSnapshotSchema.parse(JSON.parse(data ?? 'null') as unknown));
      } else if (chunk.includes('event: delta\n')) {
        const delta = executionDeltaSchema.parse(JSON.parse(data ?? 'null') as unknown);
        const base = frames.at(-1);
        const merged = base === undefined ? null : applyExecutionDelta(base, delta);
        if (merged === null) throw new Error('Delta does not continue the previous frame');
        frames.push(merged);
      }
    }
    return frames;
  }
  frameNames(): string[] {
    return this.chunks
      .map((chunk) => /(?:^|\n)event: (\S+)\n/u.exec(chunk)?.[1])
      .filter((name): name is string => name !== undefined);
  }
}

function loaded(
  state = projectRuntimeEvent(emptyProjection(), initialEvent, invocationId),
  overrides: Partial<ExecutionEntity> = {},
) {
  const conversation = conversationRow();
  const row = Object.assign(new ExecutionEntity(), {
    id: executionId,
    conversationId: conversation.id,
    invocationId,
    bindingGeneration: generation,
    sourceWatermark: state.sourceId,
    publicText: projectionText(state),
    projectionRevision: state.sequence,
    responseProfile: EXECUTION_JSON_PROFILE,
    reducerState: state,
    createdAt: new Date('2026-09-14T10:00:00Z'),
    startedAt: null,
    finishedAt: null,
    error: null,
    status: 'running' as const,
    ...overrides,
  });
  return {
    row,
    conversation: toConversationDto(conversation, 'named'),
    state,
    userMessage: 'Hello?',
  };
}

function fixture(options: Record<string, unknown> = {}) {
  let current = loaded();
  const config = new ConfigService({
    EXECUTION_CURSOR_KEY: randomBytes(32).toString('hex'),
    ...options,
  });
  const observations = new ExecutionObservationService(
    {} as ExecutionsService,
    {} as ConversationsService,
    {} as DataSource,
    config,
  );
  const load = vi.spyOn(observations, 'load').mockImplementation(() => Promise.resolve(current));
  const authority = {
    assert: vi.fn().mockImplementation(() => Promise.resolve(Date.now() + 300_000)),
  };
  const service = new ExecutionObserverService(
    observations,
    authority as unknown as StreamAuthorityService,
    config,
  );
  return {
    service,
    observations,
    authority,
    load,
    setLoaded: (next: ReturnType<typeof loaded>) => {
      current = next;
    },
  };
}

describe('execution observer authorization, recovery and capacity', () => {
  const responses: ObserverResponse[] = [];
  const response = () => {
    const value = new ObserverResponse();
    responses.push(value);
    return value;
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T10:00:00Z'));
  });
  afterEach(async () => {
    for (const value of responses.splice(0)) value.destroy();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
  });

  it('rejects revoked authority before headers or private execution lookup', async () => {
    const f = fixture();
    f.authority.assert.mockRejectedValue(new UnauthorizedException());
    const res = response();
    await expect(
      f.service.observe(principal, executionId, 'Bearer invalid', undefined, res.asExpress()),
    ).rejects.toThrow(UnauthorizedException);
    expect(res.flushHeaders).not.toHaveBeenCalled();
    expect(f.load).not.toHaveBeenCalled();
  });

  it('rejects a foreign execution before writing any SSE headers', async () => {
    const f = fixture();
    f.load.mockRejectedValue(new ApiException(404, 'execution_not_found', 'Execution not found.'));
    const res = response();
    await expect(
      f.service.observe(principal, executionId, 'Bearer valid', undefined, res.asExpress()),
    ).rejects.toThrow(ApiException);
    expect(res.flushHeaders).not.toHaveBeenCalled();
    expect(res.chunks).toEqual([]);
  });

  it('rechecks token expiry after snapshot loading and before exposing the snapshot', async () => {
    const f = fixture();
    f.authority.assert.mockResolvedValue(Date.now() + 1_000);
    f.load.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(loaded()), 2_000)),
    );
    const res = response();
    const observed = f.service
      .observe(principal, executionId, 'Bearer valid', undefined, res.asExpress())
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await observed).toBeInstanceOf(UnauthorizedException);
    expect(res.flushHeaders).not.toHaveBeenCalled();
    expect(res.chunks).toEqual([]);
  });

  it('detaches on client disconnect while leaving execution dispatch and cancellation untouched', async () => {
    const f = fixture();
    const res = response();
    const observed = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      undefined,
      res.asExpress(),
    );
    await vi.advanceTimersByTimeAsync(0);
    res.destroy();
    await observed;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('streams committed progress and same-revision completion without native replay', async () => {
    const f = fixture();
    const res = response();
    const observed = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      'opaque-client-cursor',
      res.asExpress(),
    );
    await vi.advanceTimersByTimeAsync(0);
    const suffix: RuntimeEvent = {
      id: 'source-2',
      event: 'messages/partial',
      data: [{ id: 'native-message', type: 'ai', content: 'Hello world' }],
    };
    const finished = projectRuntimeEvent(loaded().state, suffix, invocationId);
    f.setLoaded(loaded(finished));
    await vi.advanceTimersByTimeAsync(500);
    expect(res.snapshots().at(-1)).toMatchObject({
      assistantText: 'Hello world',
      revision: 2,
      execution: { status: 'running' },
    });
    f.setLoaded(loaded(finished, { status: 'completed', finishedAt: new Date() }));
    await vi.advanceTimersByTimeAsync(500);
    await observed;
    expect(f.load).toHaveBeenCalledWith(principal, executionId, 'opaque-client-cursor');
    expect(res.snapshots().at(-1)).toMatchObject({
      assistantText: 'Hello world',
      revision: 2,
      execution: { status: 'completed' },
    });
    expect(res.snapshots()).toHaveLength(3);
    expect(res.chunks.join('')).not.toContain('native-message');
    expect(res.chunks.join('')).not.toContain('source-1');
    expect(res.chunks.join('')).not.toContain(invocationId);
  });

  it('sends one full snapshot, then appends as deltas, then a full snapshot at the terminal state', async () => {
    const f = fixture();
    const res = response();
    const observed = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      undefined,
      res.asExpress(),
    );
    await vi.advanceTimersByTimeAsync(0);
    const grown = projectRuntimeEvent(
      loaded().state,
      {
        id: 'source-2',
        event: 'messages/partial',
        data: [{ id: 'native-message', type: 'ai', content: 'Hello world' }],
      },
      invocationId,
    );
    f.setLoaded(loaded(grown));
    await vi.advanceTimersByTimeAsync(500);
    f.setLoaded(loaded(grown, { status: 'completed', finishedAt: new Date() }));
    await vi.advanceTimersByTimeAsync(500);
    await observed;
    expect(res.frameNames()).toEqual(['snapshot', 'delta', 'snapshot']);
    const delta = JSON.parse(
      res.chunks.find((chunk) => chunk.includes('event: delta\n'))?.split('data: ')[1] ?? 'null',
    ) as {
      assistantAppend?: string;
      assistantText?: string;
      baseRevision: number;
      revision: number;
    };
    expect(delta).toMatchObject({ assistantAppend: ' world', baseRevision: 1, revision: 2 });
    expect(delta.assistantText).toBeUndefined();
    expect(res.snapshots().at(-1)).toMatchObject({
      assistantText: 'Hello world',
      execution: { status: 'completed' },
    });
  });

  it('keeps a quiet browser attached beyond the native replay window without repeated snapshots', async () => {
    const f = fixture();
    const res = response();
    const observed = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      undefined,
      res.asExpress(),
    );
    await vi.advanceTimersByTimeAsync(240_000);
    expect(res.writableEnded).toBe(false);
    expect(res.snapshots()).toHaveLength(1);
    expect(res.chunks.filter((chunk) => chunk === ': ping\n\n').length).toBeGreaterThanOrEqual(9);
    res.destroy();
    await observed;
  });

  it('closes a revoked observer within 25 seconds and sends no raw authority error', async () => {
    const f = fixture();
    const res = response();
    const observed = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      undefined,
      res.asExpress(),
    );
    await vi.advanceTimersByTimeAsync(0);
    f.authority.assert.mockRejectedValue(new Error('SYNTHETIC_PRIVATE_VALUE'));
    await vi.advanceTimersByTimeAsync(25_000);
    await observed;
    expect(res.writableEnded || res.destroyed).toBe(true);
    expect(res.chunks.join('')).not.toContain('SYNTHETIC_PRIVATE_VALUE');
  });

  it('fails closed within the authority interval when reauthorization hangs', async () => {
    const f = fixture();
    const res = response();
    const observed = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      undefined,
      res.asExpress(),
    );
    await vi.advanceTimersByTimeAsync(0);
    f.authority.assert.mockImplementation(() => new Promise(() => undefined));
    await vi.advanceTimersByTimeAsync(25_000);
    expect(res.writableEnded || res.destroyed).toBe(true);
    await observed;
  });

  it('closes precisely at the verified authority expiry even during quiet native work', async () => {
    const f = fixture();
    f.authority.assert.mockResolvedValue(Date.now() + 1_000);
    const res = response();
    const observed = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      undefined,
      res.asExpress(),
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(res.writableEnded).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await observed;
    expect(res.writableEnded).toBe(true);
  });

  it.each(['user', 'instance'] as const)(
    'releases %s observer capacity after disconnect',
    async (limit) => {
      const f = fixture({
        EXECUTION_MAX_OBSERVERS_PER_USER: 1,
        EXECUTION_MAX_OBSERVERS_PER_INSTANCE: limit === 'instance' ? 1 : 2,
      });
      const first = response();
      const observed = f.service.observe(
        principal,
        executionId,
        'Bearer valid',
        undefined,
        first.asExpress(),
      );
      await vi.advanceTimersByTimeAsync(0);
      const secondPrincipal =
        limit === 'user' ? principal : { ...principal, id: '01e965cd-3fb9-4a82-954b-0d7c172aebdc' };
      const rejected = response();
      await expect(
        f.service.observe(
          secondPrincipal,
          executionId,
          'Bearer valid',
          undefined,
          rejected.asExpress(),
        ),
      ).rejects.toThrow(ApiException);
      expect(rejected.flushHeaders).not.toHaveBeenCalled();
      first.destroy();
      await observed;
      const retry = response();
      const retried = f.service.observe(
        secondPrincipal,
        executionId,
        'Bearer valid',
        undefined,
        retry.asExpress(),
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(retry.flushHeaders).toHaveBeenCalledOnce();
      retry.destroy();
      await retried;
    },
  );

  it('keeps heartbeats flowing while dispatch has not acknowledged a native run', async () => {
    const f = fixture();
    f.setLoaded(loaded(emptyProjection(), { status: 'pending' }));
    const res = response();
    const observed = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      undefined,
      res.asExpress(),
    );
    await vi.advanceTimersByTimeAsync(25_000);
    expect(res.chunks).toContain(': ping\n\n');
    expect(res.snapshots()[0]?.execution.status).toBe('pending');
    res.destroy();
    await observed;
  });

  it.each(['terminal', 'legacy'] as const)(
    'serves an existing %s snapshot without native attachment',
    async (kind) => {
      const f = fixture();
      f.setLoaded(
        loaded(
          undefined,
          kind === 'terminal' ? { status: 'completed' } : { responseProfile: 'legacy' },
        ),
      );
      const res = response();
      await f.service.observe(principal, executionId, 'Bearer valid', undefined, res.asExpress());
      expect(res.snapshots()).toHaveLength(1);
      expect(res.writableEnded).toBe(true);
    },
  );

  it('serves a parked snapshot with a confirmed native end once and closes without polling', async () => {
    const f = fixture();
    f.setLoaded(
      loaded(undefined, {
        status: 'recovery_required',
        error: 'runtime_recovery_gap',
        finishedAt: new Date(),
      }),
    );
    const res = response();
    await f.service.observe(principal, executionId, 'Bearer valid', undefined, res.asExpress());
    expect(res.snapshots()).toHaveLength(1);
    expect(res.snapshots()[0]?.execution).toMatchObject({
      status: 'recovery_required',
      errorCode: 'runtime_recovery_gap',
    });
    expect(res.writableEnded).toBe(true);
    expect(f.load).toHaveBeenCalledOnce();
  });

  it('keeps observing a parked execution whose native end is not yet confirmed', async () => {
    const f = fixture();
    f.setLoaded(loaded(undefined, { status: 'interrupted', error: 'runtime_interrupted' }));
    const res = response();
    const observed = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      undefined,
      res.asExpress(),
    );
    await vi.advanceTimersByTimeAsync(25_000);
    expect(res.writableEnded).toBe(false);
    expect(res.chunks).toContain(': ping\n\n');
    expect(res.snapshots()).toHaveLength(1);
    f.setLoaded(loaded(undefined, { status: 'cancelled', finishedAt: new Date(), error: null }));
    await vi.advanceTimersByTimeAsync(500);
    await observed;
    expect(res.snapshots().at(-1)?.execution.status).toBe('cancelled');
    expect(res.writableEnded).toBe(true);
  });

  it('publishes a safe reconnect error after a durable read fails without claiming completion', async () => {
    const f = fixture();
    const res = response();
    const observed = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      undefined,
      res.asExpress(),
    );
    await vi.advanceTimersByTimeAsync(0);
    f.load.mockRejectedValue(new Error('SYNTHETIC_PRIVATE_VALUE'));
    await vi.advanceTimersByTimeAsync(500);
    await observed;
    expect(res.chunks.at(-1)).toBe(
      'event: error\ndata: {"code":"execution_stream_unavailable"}\n\n',
    );
    expect(res.snapshots().every((snapshot) => snapshot.execution.status === 'running')).toBe(true);
    expect(res.chunks.join('')).not.toContain('SYNTHETIC_PRIVATE_VALUE');
  });

  it('never rolls back a newer committed snapshot when a stale read arrives', async () => {
    const f = fixture();
    const res = response();
    const observed = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      undefined,
      res.asExpress(),
    );
    await vi.advanceTimersByTimeAsync(0);
    const suffix: RuntimeEvent = {
      id: 'source-2',
      event: 'messages/partial',
      data: [{ id: 'native-message', type: 'ai', content: 'Hello world' }],
    };
    f.setLoaded(loaded(projectRuntimeEvent(loaded().state, suffix, invocationId)));
    await vi.advanceTimersByTimeAsync(500);
    f.setLoaded(loaded());
    await vi.advanceTimersByTimeAsync(500);
    expect(res.snapshots().at(-1)).toMatchObject({
      assistantText: 'Hello world',
      revision: 2,
      execution: { status: 'running' },
    });
    expect(res.snapshots()).toHaveLength(2);
    res.destroy();
    await observed;
  });

  it('detaches immediately during a hung durable read and clears its deadline timer', async () => {
    const f = fixture();
    const res = response();
    const observed = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      undefined,
      res.asExpress(),
    );
    await vi.advanceTimersByTimeAsync(0);
    f.load.mockImplementation(() => new Promise(() => undefined));
    await vi.advanceTimersByTimeAsync(500);
    res.destroy();
    await observed;
    expect(res.chunks.join('')).not.toContain('event: error');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('delivers durable terminal status even when the native observer remains quiet', async () => {
    const f = fixture();
    const res = response();
    const observed = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      undefined,
      res.asExpress(),
    );
    await vi.advanceTimersByTimeAsync(0);
    const revision = res.snapshots().at(-1)?.revision;
    f.setLoaded(loaded(undefined, { status: 'completed', finishedAt: new Date() }));
    await vi.advanceTimersByTimeAsync(25_000);
    await observed;
    expect(res.snapshots().at(-1)).toMatchObject({ revision, execution: { status: 'completed' } });
  });

  it('keeps the remaining observer counted when another one disconnects', async () => {
    const f = fixture({ EXECUTION_MAX_OBSERVERS_PER_USER: 2 });
    const first = response();
    const second = response();
    const firstObserved = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      undefined,
      first.asExpress(),
    );
    const secondObserved = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      undefined,
      second.asExpress(),
    );
    await vi.advanceTimersByTimeAsync(0);
    first.destroy();
    await firstObserved;
    const third = response();
    const thirdObserved = f.service.observe(
      principal,
      executionId,
      'Bearer valid',
      undefined,
      third.asExpress(),
    );
    await vi.advanceTimersByTimeAsync(0);
    await expect(
      f.service.observe(principal, executionId, 'Bearer valid', undefined, response().asExpress()),
    ).rejects.toThrow(ApiException);
    second.destroy();
    third.destroy();
    await Promise.all([secondObserved, thirdObserved]);
  });
});
