import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { EXECUTION_JSON_PROFILE } from '@alfred/contracts';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';

import type { ConversationsService } from '@api/modules/conversations/application/conversations.service';
import { toConversationDto } from '@api/modules/conversations/domain/conversation';
import { ExecutionObservationService } from '@api/modules/executions/application/execution-observation.service';
import { ExecutionProcessor } from '@api/modules/executions/application/execution-processor';
import { ExecutionStreamConsumer } from '@api/modules/executions/application/execution-stream.consumer';
import type { ExecutionsService } from '@api/modules/executions/application/executions.service';
import type {
  RuntimeClient,
  RuntimeEvent,
  RuntimeRun,
} from '@api/modules/executions/application/runtime-client.port';
import type { ExecutionLeaseStore } from '@api/modules/executions/infrastructure/persistence/execution-lease.store';
import type {
  ExecutionChanges,
  ExecutionStateStore,
} from '@api/modules/executions/infrastructure/persistence/execution-state.store';
import { ExecutionEntity } from '@api/modules/executions/infrastructure/persistence/execution.entity';
import { ExecutionObserverService } from '@api/modules/stream/application/execution-observer.service';
import type { StreamAuthorityService } from '@api/modules/stream/application/stream-authority.service';
import { observedExecutionId, observedInvocationId, ObserverResponse } from './observer-fixture';
import { conversationRow, principal } from './project-fixtures';

/** A native frame and the pause before it, in milliseconds of the test clock. */
export interface PacedFrame {
  readonly frame: RuntimeEvent;
  readonly pauseMs: number;
}

/** Native positions start with the server's millisecond clock; pauses follow from them. */
export function paced(frames: readonly RuntimeEvent[]): PacedFrame[] {
  const moment = (id: string) => Number(/^(\d{13})-/u.exec(id)?.[1] ?? Number.NaN);
  return frames.map((frame, index) => {
    const pause = index === 0 ? 0 : moment(frame.id) - moment(frames[index - 1]!.id);
    return { frame, pauseMs: Number.isFinite(pause) && pause > 0 ? pause : 0 };
  });
}

/** Reads a native SSE capture (`id:`/`event:`/`data:` blocks); metadata and end frames are skipped. */
export function readNativeCapture(path: string): RuntimeEvent[] {
  const frames: RuntimeEvent[] = [];
  for (const block of readFileSync(path, 'utf8').split(/\r?\n\r?\n/u)) {
    let id = '';
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split(/\r?\n/u)) {
      if (line.startsWith('id:')) id = line.slice(3).trim();
      else if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /u, ''));
    }
    if (data.length === 0 || id === '' || event === 'metadata' || event === 'end') continue;
    try {
      frames.push({ id, event, data: JSON.parse(data.join('\n')) as unknown });
    } catch {
      // A capture cut mid-frame ends there.
    }
  }
  return frames;
}

/** PostgreSQL `jsonb` returns object keys shorter first, then bytewise: this copy does too. */
export function jsonbCopy<T>(value: T): T {
  const reorder = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(reorder);
    if (typeof item !== 'object' || item === null) return item;
    return Object.fromEntries(
      Object.entries(item)
        .sort(([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, reorder(child)]),
    );
  };
  return reorder(JSON.parse(JSON.stringify(value))) as T;
}

export interface HarnessOptions {
  /** Whether the deployment exposes work content (reasoning text, specialists' messages). */
  readonly content?: boolean;
  /**
   * Milliseconds each durable write takes on the test clock. Zero resolves a commit in the same
   * tick, so no native event can arrive while it is in flight; a real database never does that.
   */
  readonly commitMs?: number;
  /** Milliseconds each observer read of the committed row takes on the test clock. */
  readonly readMs?: number;
}

const later = <T>(ms: number, value: () => T): Promise<T> =>
  ms <= 0
    ? Promise.resolve(value())
    : new Promise((resolve) => setTimeout(() => resolve(value()), ms));

/**
 * The real worker (processor, stream consumer, commit window) and the real observer (observation
 * service, AG-UI translation, SSE writer) sharing one in-memory execution row that round-trips its
 * reducer like `jsonb`. Native frames arrive at their recorded pace on the (fake) clock; durable
 * writes and reads take `commitMs` and `readMs`, landing when they complete like a real database.
 */
export function observationHarness(frames: readonly PacedFrame[], options: HarnessOptions = {}) {
  const { content = true, commitMs = 0, readMs = 0 } = options;
  const conversation = conversationRow();
  const now = new Date();
  let row: ExecutionEntity = Object.assign(new ExecutionEntity(), {
    id: observedExecutionId,
    conversationId: conversation.id,
    invocationId: observedInvocationId,
    bindingGeneration: 'a3094b40-dd66-4759-abd1-14a39c164ad8',
    runtimeThreadId: 'thread-1',
    runtimeRunId: 'run-1',
    leaseOwner: 'worker-1',
    leaseVersion: 1,
    status: 'running' as const,
    dispatchState: 'accepted' as const,
    sourceWatermark: null,
    projectionRevision: 0,
    reducerState: {},
    publicText: '',
    responseProfile: EXECUTION_JSON_PROFILE,
    stopRequestedAt: null,
    startedAt: now,
    createdAt: now,
    finishedAt: null,
    error: null,
    deadlineAt: new Date(now.getTime() + 3_600_000),
    titleRequested: false,
  });
  const commits: { readonly at: number; readonly revision: number; readonly status: string }[] = [];
  const write = (changes: ExecutionChanges): ExecutionEntity => {
    const stored =
      changes.reducerState === undefined ? {} : { reducerState: jsonbCopy(changes.reducerState) };
    row = Object.assign(new ExecutionEntity(), { ...row, ...changes, ...stored });
    commits.push({ at: Date.now(), revision: row.projectionRevision, status: row.status });
    return row;
  };
  let ended = false;
  const run = (): RuntimeRun => ({
    executionId: row.id,
    invocationId: row.invocationId,
    threadId: 'thread-1',
    runId: 'run-1',
    status: ended ? 'success' : 'running',
    stopRequested: false,
    replayAvailable: true,
  });
  const runtime: RuntimeClient = {
    dispatch: () => Promise.resolve(run()),
    inspect: () => Promise.resolve(run()),
    cancel: () => Promise.resolve(run()),
    generateTitle: () => Promise.resolve(null),
    // Like the native server, a join resumes after the Last-Event-ID it is given.
    join: async function* (_id, _invocation, options) {
      const start =
        options.after === null ? 0 : frames.findIndex((f) => f.frame.id === options.after) + 1;
      if (start === 0 && options.after !== null) throw new Error('Unknown resume position');
      for (const { frame, pauseMs } of frames.slice(start)) {
        if (pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
        if (options.signal.aborted) return;
        yield frame;
      }
      ended = true;
    },
  };
  const states = {
    load: vi.fn(() => Promise.resolve(row)),
    update: vi.fn((_fence: unknown, changes: ExecutionChanges) =>
      later(commitMs, () => write(changes)),
    ),
    updateProjection: vi.fn((_fence: unknown, changes: ExecutionChanges) =>
      later(commitMs, () => {
        write(changes);
        return true;
      }),
    ),
    authorityHolds: vi.fn(() => Promise.resolve(true)),
    abandon: vi.fn(() => Promise.resolve(true)),
    applyTitle: vi.fn(() => Promise.resolve()),
  } as unknown as ExecutionStateStore;
  const config = new ConfigService({
    EXECUTION_CURSOR_KEY: randomBytes(32).toString('hex'),
    EXECUTION_COMMIT_WINDOW_MS: 500,
    EXECUTION_LEASE_MS: 30_000,
    EXECUTION_WORK_LOG_CONTENT_ENABLED: content,
  });
  const leases = { renew: vi.fn(() => Promise.resolve(true)) } as unknown as ExecutionLeaseStore;
  const processor = new ExecutionProcessor(
    states,
    leases,
    runtime,
    config,
    new ExecutionStreamConsumer(states, runtime, config),
  );
  const executions = {
    getObservation: () =>
      later(readMs, () =>
        Object.assign(new ExecutionEntity(), { ...row, reducerState: jsonbCopy(row.reducerState) }),
      ),
  } as unknown as ExecutionsService;
  const conversations = {
    get: () => Promise.resolve(toConversationDto(conversation, 'named')),
  } as unknown as ConversationsService;
  const dataSource = {
    getRepository: () => ({ findOne: () => Promise.resolve({ content: 'Question?' }) }),
  } as unknown as DataSource;
  const observations = new ExecutionObservationService(
    executions,
    conversations,
    dataSource,
    config,
  );
  const authority = {
    assert: () => Promise.resolve(Date.now() + 3_600_000),
  } as unknown as StreamAuthorityService;
  const observer = new ExecutionObserverService(observations, authority, config);
  return {
    commits,
    row: () => row,
    process: () => processor.process(row),
    /** Opens one observation; `endedAt()` is the clock when it ended, null while it lasts. */
    attach: (cursor?: string) => {
      const response = new ObserverResponse();
      let endedAt: number | null = null;
      const done = observer
        .observe(principal, row.id, 'Bearer valid', cursor, response.asExpress())
        .finally(() => {
          endedAt = Date.now();
        });
      return { response, done, endedAt: () => endedAt };
    },
  };
}
