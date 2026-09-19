import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { ApiException } from '@api/common/errors/api.exception';
import { ExecutionProcessor } from '@api/modules/executions/application/execution-processor';
import { ExecutionStreamConsumer } from '@api/modules/executions/application/execution-stream.consumer';
import {
  RuntimeClientError,
  type GeneratedTitle,
  type RuntimeClient,
  type RuntimeRun,
  type RuntimeEvent,
} from '@api/modules/executions/application/runtime-client.port';
import type { ExecutionLeaseStore } from '@api/modules/executions/infrastructure/persistence/execution-lease.store';
import {
  ExecutionFenceLost,
  type ExecutionStateStore,
} from '@api/modules/executions/infrastructure/persistence/execution-state.store';
import type { ExecutionEntity } from '@api/modules/executions/infrastructure/persistence/execution.entity';
import { deferred } from '../../../../support/execution-processor-fixture';

const chunk = (id: string, content: string): RuntimeEvent => ({
  id,
  event: 'messages-tuple',
  data: [{ id: 'a', type: 'ai', content }, {}],
});

function build(status: RuntimeRun['status'] = 'running', overrides: Partial<ExecutionEntity> = {}) {
  let row = {
    id: 'execution-1',
    invocationId: 'invocation-1',
    runtimeThreadId: 'thread-1',
    runtimeRunId: 'run-1',
    status: 'running',
    dispatchState: 'accepted',
    sourceWatermark: null,
    projectionRevision: 0,
    reducerState: {},
    publicText: '',
    stopRequestedAt: null,
    deadlineAt: new Date(Date.now() + 600000),
    titleRequested: false,
    ...overrides,
  } as ExecutionEntity;
  let run: RuntimeRun = {
    executionId: row.id,
    invocationId: row.invocationId,
    threadId: 'thread-1',
    runId: 'run-1',
    status,
    stopRequested: false,
    replayAvailable: true,
  };
  const update = vi.fn((_f: unknown, changes: object) =>
    Promise.resolve((row = { ...row, ...changes })),
  );
  const updateProjection = vi.fn((_f: unknown, changes: object) => {
    row = { ...row, ...changes };
    return Promise.resolve(true);
  });
  const authorityHolds = vi.fn(() => Promise.resolve(true));
  const abandon = vi.fn<ExecutionStateStore['abandon']>(() => Promise.resolve(true));
  const applyTitle = vi.fn<ExecutionStateStore['applyTitle']>(() => Promise.resolve());
  const state = {
    load: vi.fn(() => Promise.resolve(row)),
    update,
    updateProjection,
    authorityHolds,
    abandon,
    applyTitle,
  } as unknown as ExecutionStateStore;
  const renew = vi.fn().mockResolvedValue(true);
  const lease = { renew } as unknown as ExecutionLeaseStore;
  const dispatch = vi.fn().mockResolvedValue(run);
  const inspect = vi.fn(() => Promise.resolve(run));
  const cancel = vi.fn<RuntimeClient['cancel']>(() =>
    Promise.resolve((run = { ...run, status: 'interrupted' })),
  );
  // Like the native server, the default replay honours Last-Event-ID: nothing after 'source-1'.
  const join = vi.fn<RuntimeClient['join']>(async function* (_id, _invocation, options) {
    await Promise.resolve();
    if (options.after === 'source-1') return;
    yield chunk('source-1', 'Hello');
  });
  const generateTitle = vi.fn<RuntimeClient['generateTitle']>(() => Promise.resolve(null));
  const runtime = { dispatch, inspect, cancel, join, generateTitle } as RuntimeClient;
  const config = { get: vi.fn() } as unknown as ConfigService;
  return {
    processor: new ExecutionProcessor(
      state,
      lease,
      runtime,
      config,
      new ExecutionStreamConsumer(state, runtime, config),
    ),
    row,
    update,
    updateProjection,
    authorityHolds,
    abandon,
    applyTitle,
    renew,
    dispatch,
    inspect,
    cancel,
    join,
    generateTitle,
    getRow: () => row,
  };
}

describe('server-owned execution processor', () => {
  it('early EOF with runtime still running is recovering, never completed', async () => {
    const b = build();
    await b.processor.process(b.row);
    expect(b.getRow().status).toBe('recovering');
    expect(
      b.update.mock.calls.some(
        ([, changes]) => (changes as { status?: string }).status === 'completed',
      ),
    ).toBe(false);
  });
  it('requires persisted projection and authoritative runtime success before completing', async () => {
    const b = build('success');
    await b.processor.process(b.row);
    expect(b.getRow()).toMatchObject({
      status: 'completed',
      sourceWatermark: 'source-1',
      publicText: 'Hello',
      projectionRevision: 1,
    });
    expect(b.inspect).toHaveBeenCalledTimes(2);
    // Completion needed one confirmation rejoin from the committed watermark that yielded nothing new.
    expect(b.join.mock.calls.map(([, , options]) => options.after)).toEqual([null, 'source-1']);
  });
  it('keeps draining after a clean early stream end and completes only once a rejoin yields nothing', async () => {
    const b = build('success');
    b.join
      .mockImplementationOnce(async function* () {
        await Promise.resolve();
        yield chunk('source-1', 'Hello');
      })
      .mockImplementationOnce(async function* () {
        await Promise.resolve();
        yield chunk('source-2', ' world');
      })
      .mockImplementationOnce(async function* () {
        await Promise.resolve();
        yield* [];
      });
    await b.processor.process(b.row);
    expect(b.join.mock.calls.map(([, , options]) => options.after)).toEqual([
      null,
      'source-1',
      'source-2',
    ]);
    expect(b.getRow()).toMatchObject({
      status: 'completed',
      sourceWatermark: 'source-2',
      publicText: 'Hello world',
      projectionRevision: 2,
    });
    expect(b.inspect).toHaveBeenCalledTimes(2);
  });
  it('never reports completed while rejoins keep delivering source events', async () => {
    const b = build('success');
    let sequence = 0;
    b.join.mockImplementation(async function* () {
      sequence += 1;
      await Promise.resolve();
      yield chunk(`source-${sequence}`, 'x');
    });
    await b.processor.process(b.row);
    expect(b.join).toHaveBeenCalledTimes(4);
    expect(b.getRow()).toMatchObject({ status: 'recovering', sourceWatermark: 'source-4' });
    expect(
      b.update.mock.calls.some(
        ([, changes]) => (changes as { status?: string }).status === 'completed',
      ),
    ).toBe(false);
  });
  it('unknown dispatch acceptance is inspected without dispatching replacement work', async () => {
    const b = build('unresolved', { dispatchState: 'unknown', runtimeRunId: null });
    await b.processor.process(b.row);
    expect(b.dispatch).not.toHaveBeenCalled();
    expect(b.join).not.toHaveBeenCalled();
    expect(b.getRow()).toMatchObject({ status: 'recovering', dispatchState: 'unknown' });
  });
  it('Stop remains nonterminal until an authoritative interrupted outcome', async () => {
    const b = build('running', { stopRequestedAt: new Date() });
    await b.processor.process(b.row);
    expect(b.cancel).toHaveBeenCalledOnce();
    expect(b.getRow().status).toBe('cancelled');
  });
  it('a deadline survives process replacement and cancels the original invocation', async () => {
    const b = build('running', { deadlineAt: new Date(Date.now() - 1000) });
    await b.processor.process(b.row);
    expect(b.cancel).toHaveBeenCalledWith('execution-1', 'invocation-1', expect.any(AbortSignal));
    expect(b.getRow().status).toBe('timed_out');
  });
  it('a failed projection transaction cannot produce public success', async () => {
    const b = build('success');
    b.update.mockRejectedValueOnce(new Error('database outage'));
    await b.processor.process(b.row);
    expect(b.getRow().status).not.toBe('completed');
  });
  it('never reports successful blank output when final message classification is missing', async () => {
    const b = build('success');
    b.join.mockImplementation(async function* () {
      await Promise.resolve();
      yield {
        id: 'source-1',
        event: 'messages/complete',
        data: [{ id: 'answer', type: 'ai', content: 'unclassified' }],
      };
    });
    await b.processor.process(b.row);
    expect(b.getRow()).toMatchObject({
      status: 'recovery_required',
      error: 'runtime_output_incomplete',
    });
  });
  it('schedules safe cancellation when source projection is malformed, keeping its active slot', async () => {
    const b = build();
    b.join.mockImplementation(async function* () {
      await Promise.resolve();
      yield { id: 'source-1', event: 'messages-tuple', data: null };
    });
    await b.processor.process(b.row);
    expect(b.getRow()).toMatchObject({
      status: 'recovery_required',
      error: 'runtime_event_invalid',
    });
    expect(b.getRow().stopRequestedAt).toBeInstanceOf(Date);
    await b.processor.process(b.getRow());
    expect(b.cancel).toHaveBeenCalledOnce();
    expect(b.getRow().finishedAt).toBeInstanceOf(Date);
    expect(b.getRow().status).toBe('recovery_required');
  });
  it('a queued Stop completes locally before any dispatch intent can reach the runtime', async () => {
    const b = build('pending', {
      dispatchState: 'pending',
      runtimeRunId: null,
      stopRequestedAt: new Date(),
    });
    await b.processor.process(b.row);
    expect(b.dispatch).not.toHaveBeenCalled();
    expect(b.inspect).not.toHaveBeenCalled();
    expect(b.getRow().status).toBe('cancelled');
  });
  it('a foreign runtime identity never enters the product projection', async () => {
    const b = build('success');
    b.inspect.mockResolvedValueOnce({ executionId: 'foreign' } as RuntimeRun);
    await b.processor.process(b.row);
    expect(b.join).not.toHaveBeenCalled();
    expect(b.getRow().status).toBe('recovering');
  });

  it('does not retry an uncertain native dispatch when inspection returns not found', async () => {
    const b = build('success', { dispatchState: 'dispatching', runtimeRunId: null });
    b.inspect.mockRejectedValueOnce(new RuntimeClientError('runtime_invocation_not_found'));
    await b.processor.process(b.row);
    expect(b.dispatch).not.toHaveBeenCalled();
    expect(b.join).not.toHaveBeenCalled();
    expect(b.getRow().status).toBe('recovering');
  });
  it('an unavailable inspect response never authorizes another dispatch attempt', async () => {
    const b = build('running', { dispatchState: 'dispatching', runtimeRunId: null });
    b.inspect.mockRejectedValueOnce(new RuntimeClientError('runtime_unavailable'));
    await b.processor.process(b.row);
    expect(b.dispatch).not.toHaveBeenCalled();
  });

  it('times out unresolved acceptance after the deadline without dispatching replacement work', async () => {
    const b = build('unresolved', {
      dispatchState: 'unknown',
      runtimeRunId: null,
      deadlineAt: new Date(Date.now() - 1000),
    });
    b.cancel.mockResolvedValue({
      executionId: 'execution-1',
      invocationId: 'invocation-1',
      threadId: 'thread-1',
      runId: null,
      status: 'unresolved',
      stopRequested: true,
      replayAvailable: false,
    });
    await b.processor.process(b.row);
    expect(b.getRow()).toMatchObject({
      status: 'timed_out',
      error: 'execution_deadline_exceeded',
    });
    expect(b.getRow().finishedAt).toBeInstanceOf(Date);
    expect(b.cancel).toHaveBeenCalledOnce();
    expect(b.dispatch).not.toHaveBeenCalled();
    expect(b.join).not.toHaveBeenCalled();
  });

  it.each(['interrupted', 'recovery_required', 'recovering'] as const)(
    'times out a parked %s execution once its deadline passes, cancelling best-effort',
    async (status) => {
      const b = build('running', { status, deadlineAt: new Date(Date.now() - 1000) });
      b.cancel.mockRejectedValue(new RuntimeClientError('runtime_unavailable'));
      await b.processor.process(b.row);
      expect(b.cancel).toHaveBeenCalledOnce();
      expect(b.getRow()).toMatchObject({
        status: 'timed_out',
        error: 'execution_deadline_exceeded',
      });
      expect(b.join).not.toHaveBeenCalled();
    },
  );

  it('makes a missing known native run an explicit recovery gap before stream attachment', async () => {
    const b = build();
    b.inspect.mockRejectedValue(new RuntimeClientError('runtime_replay_expired'));
    await b.processor.process(b.row);
    expect(b.getRow()).toMatchObject({
      status: 'recovery_required',
      error: 'runtime_recovery_gap',
    });
    expect(b.dispatch).not.toHaveBeenCalled();
  });

  it('ends an unreachable execution as timed out once its deadline passes instead of reconnecting forever', async () => {
    const b = build('running', { deadlineAt: new Date(Date.now() - 1000) });
    b.inspect.mockRejectedValue(new RuntimeClientError('runtime_unavailable'));
    b.cancel.mockRejectedValue(new RuntimeClientError('runtime_unavailable'));
    await b.processor.process(b.row);
    expect(b.getRow()).toMatchObject({
      status: 'timed_out',
      error: 'execution_deadline_exceeded',
    });
    expect(b.getRow().finishedAt).toBeInstanceOf(Date);
    expect(b.dispatch).not.toHaveBeenCalled();
  });

  it('never reports a blank success when the only text came from a withheld sub-graph', async () => {
    const b = build('success');
    b.join.mockImplementation(async function* (_id, _invocation, options) {
      await Promise.resolve();
      if (options.after !== null) return;
      yield {
        id: 'source-1',
        event: 'messages|specialist:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        data: [{ id: 'child', type: 'AIMessageChunk', content: 'CHILD_TEXT' }, {}],
      };
    });
    await b.processor.process(b.row);
    expect(b.getRow()).toMatchObject({
      status: 'recovery_required',
      error: 'runtime_output_incomplete',
      publicText: '',
    });
    expect(JSON.stringify(b.getRow().reducerState)).not.toContain('CHILD_TEXT');
  });
});

describe('lost authority and conversation titles', () => {
  it('cancels the native run and abandons the row when the fence loses its resource authority', async () => {
    const b = build();
    b.update.mockImplementation(() => Promise.reject(new ExecutionFenceLost()));
    await b.processor.process(b.row);
    expect(b.renew).toHaveBeenCalled();
    expect(b.cancel).toHaveBeenCalledOnce();
    expect(b.abandon).toHaveBeenCalledExactlyOnceWith(b.row, 'execution_authority_lost');
  });
  it('writes nothing under a fence that a successor lease already took over', async () => {
    const b = build();
    b.update.mockImplementation(() => Promise.reject(new ExecutionFenceLost()));
    b.renew.mockResolvedValue(false);
    await b.processor.process(b.row);
    expect(b.cancel).not.toHaveBeenCalled();
    expect(b.abandon).not.toHaveBeenCalled();
  });
  it('abandons the row when trusted runtime resolution reports lost authority', async () => {
    const b = build();
    b.inspect.mockRejectedValue(
      new ApiException(403, 'execution_authority_lost', 'Execution access is unavailable.'),
    );
    await b.processor.process(b.row);
    expect(b.abandon).toHaveBeenCalledOnce();
    expect(
      b.update.mock.calls.some(
        ([, changes]) => (changes as { status?: string }).status === 'recovering',
      ),
    ).toBe(false);
  });
  it('still abandons when the recovery write itself is refused for lost authority', async () => {
    const b = build();
    b.inspect.mockRejectedValue(new RuntimeClientError('runtime_unavailable'));
    b.update.mockImplementation(() => Promise.reject(new ExecutionFenceLost()));
    await b.processor.process(b.row);
    expect(b.abandon).toHaveBeenCalledOnce();
  });
  it('keeps the title request pending when the title graph returns nothing', async () => {
    const b = build('success', { titleRequested: true });
    await b.processor.process(b.row);
    expect(b.generateTitle).toHaveBeenCalledOnce();
    expect(b.applyTitle).not.toHaveBeenCalled();
    expect(
      b.update.mock.calls.some(
        ([, changes]) => (changes as { titleRequested?: boolean }).titleRequested === false,
      ),
    ).toBe(false);
    expect(b.getRow().titleRequested).toBe(true);
  });
  it('applies a title that arrives after completion, outside the processing signal and fence', async () => {
    const title = deferred<GeneratedTitle | null>();
    const b = build('success', { titleRequested: true });
    b.generateTitle.mockReturnValue(title.promise);
    await b.processor.process(b.row);
    expect(b.getRow().status).toBe('completed');
    expect(b.generateTitle.mock.calls[0]?.[2].aborted).toBe(false);
    title.resolve({ title: ' « Un titre » ', language: 'fr' });
    await vi.waitFor(() => expect(b.applyTitle).toHaveBeenCalledWith(b.row, 'Un titre'));
  });
  it('settles an unusable generated title without replacing the provisional one', async () => {
    const b = build('success', { titleRequested: true });
    b.generateTitle.mockResolvedValue({ title: 'Fallback', language: null });
    await b.processor.process(b.row);
    await vi.waitFor(() => expect(b.applyTitle).toHaveBeenCalledWith(b.row, null));
  });
});
