import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import { ExecutionProcessor } from '@api/modules/executions/application/execution-processor';
import { ExecutionStreamConsumer } from '@api/modules/executions/application/execution-stream.consumer';
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
import type { ExecutionEntity } from '@api/modules/executions/infrastructure/persistence/execution.entity';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function messageEvent(id = 'source-1', content = 'Hello'): RuntimeEvent {
  return {
    id,
    event: 'messages-tuple',
    data: [{ id: 'answer', type: 'AIMessageChunk', content }, {}],
  };
}

export function processorFixture(overrides: Partial<ExecutionEntity> = {}) {
  let row = {
    id: 'execution-1',
    invocationId: 'invocation-1',
    runtimeThreadId: 'thread-1',
    runtimeRunId: 'run-1',
    bindingGeneration: 'generation-1',
    leaseOwner: 'worker-1',
    leaseVersion: 1,
    status: 'running',
    dispatchState: 'accepted',
    sourceWatermark: null,
    projectionRevision: 0,
    reducerState: {},
    publicText: '',
    stopRequestedAt: null,
    finishedAt: null,
    deadlineAt: new Date(Date.now() + 600_000),
    titleRequested: false,
    ...overrides,
  } as ExecutionEntity;
  let run: RuntimeRun = {
    executionId: row.id,
    invocationId: row.invocationId,
    threadId: 'thread-1',
    runId: 'run-1',
    status: 'running',
    stopRequested: false,
    replayAvailable: true,
  };
  const load = vi.fn(() => Promise.resolve<ExecutionEntity | null>(row));
  const update = vi.fn((_fence: unknown, changes: ExecutionChanges) => {
    row = { ...row, ...changes };
    return Promise.resolve(row);
  });
  const updateProjection = vi.fn((_fence: unknown, changes: ExecutionChanges) => {
    row = { ...row, ...changes };
    return Promise.resolve(true);
  });
  const authorityHolds = vi.fn(() => Promise.resolve(true));
  const abandon = vi.fn<ExecutionStateStore['abandon']>(() => Promise.resolve(true));
  const applyTitle = vi.fn<ExecutionStateStore['applyTitle']>(() => Promise.resolve());
  const renew = vi.fn(() => Promise.resolve(true));
  const dispatch = vi.fn<RuntimeClient['dispatch']>(() => Promise.resolve(run));
  const inspect = vi.fn<RuntimeClient['inspect']>(() => Promise.resolve(run));
  const cancel = vi.fn<RuntimeClient['cancel']>(() =>
    Promise.resolve({ ...run, status: 'interrupted', stopRequested: true }),
  );
  // Like the native server, the default replay honours Last-Event-ID: nothing after 'source-1'.
  const join = vi.fn<RuntimeClient['join']>(async function* (_id, _invocation, options) {
    await Promise.resolve();
    if (options.after !== null) return;
    yield messageEvent();
  });
  const generateTitle = vi.fn<RuntimeClient['generateTitle']>(() => Promise.resolve(null));
  const runtime = { dispatch, inspect, cancel, join, generateTitle } satisfies RuntimeClient;
  const states = {
    load,
    update,
    updateProjection,
    authorityHolds,
    abandon,
    applyTitle,
  } as unknown as ExecutionStateStore;
  const config = new ConfigService({ EXECUTION_LEASE_MS: 30_000, EXECUTION_COMMIT_WINDOW_MS: 500 });
  const processor = new ExecutionProcessor(
    states,
    { renew } as unknown as ExecutionLeaseStore,
    runtime,
    config,
    new ExecutionStreamConsumer(states, runtime, config),
  );
  const holdStream = () => {
    const started = deferred<AbortSignal>();
    const ended = deferred<void>();
    join.mockImplementation(async function* (_id, _invocation, options) {
      yield messageEvent();
      started.resolve(options.signal);
      const aborted = () => ended.resolve();
      options.signal.addEventListener('abort', aborted, { once: true });
      try {
        if (!options.signal.aborted) await ended.promise;
      } finally {
        options.signal.removeEventListener('abort', aborted);
      }
    });
    return { started: started.promise, end: () => ended.resolve() };
  };
  return {
    processor,
    load,
    update,
    updateProjection,
    authorityHolds,
    abandon,
    applyTitle,
    renew,
    ...runtime,
    holdStream,
    row: () => row,
    run: () => run,
    setRow: (changes: Partial<ExecutionEntity>) => {
      row = { ...row, ...changes };
    },
    setRun: (changes: Partial<RuntimeRun>) => {
      run = { ...run, ...changes };
    },
  };
}
