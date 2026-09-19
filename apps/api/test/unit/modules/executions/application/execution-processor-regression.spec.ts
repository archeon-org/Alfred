import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeClientError } from '@api/modules/executions/application/runtime-client.port';
import {
  deferred,
  messageEvent,
  processorFixture,
} from '../../../../support/execution-processor-fixture';

describe('execution processor lease and in-flight lifecycle regressions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renews a four-minute quiet run without redispatch, completion or a second native attachment', async () => {
    const f = processorFixture();
    const stream = f.holdStream();
    const processing = f.processor.process(f.row());
    const signal = await stream.started;
    await vi.advanceTimersByTimeAsync(240_000);
    expect(f.renew).toHaveBeenCalledTimes(48);
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.join).toHaveBeenCalledOnce();
    expect(f.inspect).toHaveBeenCalledOnce();
    expect(signal.aborted).toBe(false);
    expect(f.row()).toMatchObject({ status: 'running', publicText: 'Hello', finishedAt: null });
    f.setRun({ status: 'success' });
    stream.end();
    await processing;
    expect(f.row().status).toBe('completed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['rejected renewal', 'renewal outage', 'deleted execution'] as const)(
    'abandons a quiet stream after %s without cancelling or writing an outcome under the lost fence',
    async (failure) => {
      const f = processorFixture();
      const stream = f.holdStream();
      const processing = f.processor.process(f.row());
      const signal = await stream.started;
      const committed = f.update.mock.calls.length;
      if (failure === 'rejected renewal') f.renew.mockResolvedValue(false);
      else if (failure === 'renewal outage')
        f.renew.mockRejectedValue(new Error('database unavailable'));
      else f.load.mockResolvedValue(null);
      await vi.advanceTimersByTimeAsync(5_000);
      await processing;
      expect(signal.aborted).toBe(true);
      expect(f.update).toHaveBeenCalledTimes(committed);
      expect(f.cancel).not.toHaveBeenCalled();
      expect(f.inspect).toHaveBeenCalledOnce();
      expect(f.row()).toMatchObject({
        publicText: 'Hello',
        sourceWatermark: 'source-1',
        finishedAt: null,
      });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('does not pile up concurrent renewal requests when PostgreSQL is slow', async () => {
    const f = processorFixture();
    const renewal = deferred<boolean>();
    f.renew.mockReturnValue(renewal.promise);
    const stream = f.holdStream();
    const processing = f.processor.process(f.row());
    await stream.started;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(f.renew).toHaveBeenCalledOnce();
    renewal.resolve(false);
    await processing;
    expect(f.cancel).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['Stop', 'deadline'] as const)(
    'interrupts a quiet native attachment when %s arrives after dispatch and preserves partial output',
    async (reason) => {
      const f = processorFixture();
      const stream = f.holdStream();
      const processing = f.processor.process(f.row());
      const signal = await stream.started;
      f.setRow(
        reason === 'Stop'
          ? { stopRequestedAt: new Date() }
          : { deadlineAt: new Date(Date.now() + 5_000) },
      );
      await vi.advanceTimersByTimeAsync(5_000);
      await processing;
      expect(signal.aborted).toBe(true);
      expect(f.cancel).toHaveBeenCalledExactlyOnceWith(
        'execution-1',
        'invocation-1',
        expect.any(AbortSignal),
      );
      expect(f.row()).toMatchObject({
        status: reason === 'Stop' ? 'cancelled' : 'timed_out',
        publicText: 'Hello',
        sourceWatermark: 'source-1',
        projectionRevision: 1,
      });
      expect(f.row().finishedAt).toBeInstanceOf(Date);
      expect(f.dispatch).not.toHaveBeenCalled();
    },
  );

  it('finishes replay of an already successful run even when its saved deadline passes during replay', async () => {
    const f = processorFixture({ deadlineAt: new Date(Date.now() + 5_000) });
    f.setRun({ status: 'success' });
    const stream = f.holdStream();
    const processing = f.processor.process(f.row());
    const signal = await stream.started;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(signal.aborted).toBe(false);
    expect(f.cancel).not.toHaveBeenCalled();
    stream.end();
    await processing;
    expect(f.row()).toMatchObject({ status: 'completed', publicText: 'Hello' });
  });

  it('shutdown detaches native observation while retaining the original invocation for recovery', async () => {
    const f = processorFixture();
    const stream = f.holdStream();
    const processing = f.processor.process(f.row());
    const signal = await stream.started;
    f.processor.shutdown();
    await processing;
    expect(signal.aborted).toBe(true);
    expect(f.cancel).not.toHaveBeenCalled();
    expect(f.row()).toMatchObject({
      status: 'recovering',
      invocationId: 'invocation-1',
      sourceWatermark: 'source-1',
      publicText: 'Hello',
      finishedAt: null,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('execution processor dispatch and outcome regressions', () => {
  it('cannot dispatch when persisting its initial dispatch intent fails', async () => {
    const f = processorFixture({ status: 'pending', dispatchState: 'pending', runtimeRunId: null });
    f.update.mockRejectedValue(new Error('database unavailable'));
    await f.processor.process(f.row());
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.join).not.toHaveBeenCalled();
    expect(f.row().status).toBe('pending');
  });

  it('reconciles repeated lost-ack attempts against one original dispatch, without duplicating committed text', async () => {
    const f = processorFixture({ status: 'pending', dispatchState: 'pending', runtimeRunId: null });
    f.dispatch.mockRejectedValueOnce(new RuntimeClientError('runtime_unavailable'));
    await f.processor.process(f.row());
    expect(f.row().dispatchState).toBe('dispatching');
    await f.processor.process(f.row());
    f.setRun({ status: 'success' });
    await f.processor.process(f.row());
    expect(f.dispatch).toHaveBeenCalledOnce();
    // The last join is the confirmation rejoin from the committed watermark that yields nothing.
    expect(f.join.mock.calls.map(([, , options]) => options.after)).toEqual([
      null,
      'source-1',
      'source-1',
    ]);
    expect(f.row()).toMatchObject({
      status: 'completed',
      publicText: 'Hello',
      projectionRevision: 1,
    });
  });

  it('retains the last committed cursor across a mid-stream outage and deduplicates the resumed anchor', async () => {
    const f = processorFixture();
    f.join.mockImplementationOnce(async function* () {
      yield messageEvent();
      await Promise.resolve();
      throw new RuntimeClientError('runtime_unavailable');
    });
    await f.processor.process(f.row());
    expect(f.row()).toMatchObject({
      status: 'recovering',
      sourceWatermark: 'source-1',
      publicText: 'Hello',
    });
    f.join.mockImplementationOnce(async function* () {
      yield messageEvent();
      await Promise.resolve();
      yield messageEvent('source-2', ' world');
    });
    f.setRun({ status: 'success' });
    await f.processor.process(f.row());
    expect(f.join.mock.calls[1]?.[2].after).toBe('source-1');
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.row()).toMatchObject({
      status: 'completed',
      publicText: 'Hello world',
      sourceWatermark: 'source-2',
      projectionRevision: 2,
    });
  });

  it('expires queued work locally before any native request is made', async () => {
    const f = processorFixture({
      status: 'pending',
      dispatchState: 'pending',
      runtimeRunId: null,
      deadlineAt: new Date(Date.now() - 1),
    });
    await f.processor.process(f.row());
    expect(f.row().status).toBe('timed_out');
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.inspect).not.toHaveBeenCalled();
    expect(f.cancel).not.toHaveBeenCalled();
    expect(f.join).not.toHaveBeenCalled();
  });

  it.each([
    ['error', 'failed', 'runtime_failed'],
    ['timeout', 'timed_out', 'execution_deadline_exceeded'],
    ['interrupted', 'interrupted', 'runtime_interrupted'],
  ] as const)(
    'maps authoritative %s to %s while retaining the projected answer',
    async (native, status, error) => {
      const f = processorFixture();
      f.setRun({ status: native });
      await f.processor.process(f.row());
      expect(f.row()).toMatchObject({ status, error, publicText: 'Hello' });
      if (native === 'interrupted') expect(f.row().finishedAt).toBeNull();
      else expect(f.row().finishedAt).toBeInstanceOf(Date);
    },
  );

  it('keeps Stop pending when cancellation has been accepted but the native run still reports running', async () => {
    const f = processorFixture({ stopRequestedAt: new Date() });
    f.cancel.mockImplementation(() => Promise.resolve({ ...f.run(), stopRequested: true }));
    await f.processor.process(f.row());
    expect(f.row()).toMatchObject({ status: 'stopping', finishedAt: null, publicText: 'Hello' });
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  it('does not turn successful native work with expired replay into a fabricated completed answer', async () => {
    const f = processorFixture();
    f.setRun({ status: 'success', replayAvailable: false });
    await f.processor.process(f.row());
    expect(f.row()).toMatchObject({
      status: 'recovery_required',
      error: 'runtime_recovery_gap',
      publicText: '',
    });
    expect(f.join).not.toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  it.each(['invocationId', 'threadId', 'runId'] as const)(
    'rejects a mismatched native %s before publishing any stream output',
    async (field) => {
      const f = processorFixture();
      f.setRun({ [field]: 'foreign' });
      await f.processor.process(f.row());
      expect(f.join).not.toHaveBeenCalled();
      expect(f.row()).toMatchObject({
        status: 'recovering',
        publicText: '',
        sourceWatermark: null,
      });
    },
  );

  it('rejects a foreign cancellation acknowledgement without marking the original execution cancelled', async () => {
    const f = processorFixture({ stopRequestedAt: new Date() });
    f.cancel.mockResolvedValue({ ...f.run(), invocationId: 'foreign', status: 'interrupted' });
    await f.processor.process(f.row());
    expect(f.row()).toMatchObject({ status: 'stopping', finishedAt: null });
    expect(f.join).not.toHaveBeenCalled();
  });

  it('keeps committed text recoverable when final status inspection fails after a fully drained stream', async () => {
    const f = processorFixture();
    f.inspect
      .mockResolvedValueOnce(f.run())
      .mockRejectedValueOnce(new RuntimeClientError('runtime_unavailable'));
    await f.processor.process(f.row());
    expect(f.row()).toMatchObject({
      status: 'recovering',
      finishedAt: null,
      publicText: 'Hello',
      sourceWatermark: 'source-1',
    });
    expect(f.dispatch).not.toHaveBeenCalled();
  });
});
