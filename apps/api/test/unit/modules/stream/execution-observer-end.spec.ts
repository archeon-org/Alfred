import { EXECUTION_STREAM_UNAVAILABLE_CODE } from '@alfred/contracts';
import { UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiException } from '@api/common/errors/api.exception';
import type { RuntimeEvent } from '@api/modules/executions/application/runtime-client.port';
import {
  emptyProjection,
  projectRuntimeEvent,
} from '@api/modules/executions/infrastructure/langgraph/runtime-projection';
import { AgUiTranslationGap } from '@api/modules/stream/application/ag-ui-translation';
import {
  errorEnd,
  observationEndLevel,
  ObservationEnding,
  ObservationLoadTimeout,
  ObservationRevisionRegressed,
  writerEnd,
} from '@api/modules/stream/application/observation-end';
import {
  captureObservationEnds,
  observedExecutionId,
  observedInvocationId,
  observedRow,
  observerFixture,
  ObserverResponse,
} from '../../../support/observer-fixture';
import { principal } from '../../../support/project-fixtures';

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

const hello: RuntimeEvent = {
  id: 'source-1',
  event: 'messages',
  data: [{ id: 'native-message', type: 'ai', content: 'SECRET USER ANSWER' }, {}],
};
const initial = () =>
  observedRow(projectRuntimeEvent(emptyProjection(), hello, observedInvocationId));

describe('structured end of an execution observation', () => {
  const responses: ObserverResponse[] = [];
  const response = (write?: (chunk: string) => boolean) => {
    const value = new ObserverResponse();
    if (write !== undefined) value.write.mockImplementation(write);
    responses.push(value);
    return value;
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T10:00:00Z'));
  });
  afterEach(async () => {
    for (const value of responses.splice(0)) value.destroy();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
  });

  const observe = (f: ReturnType<typeof observerFixture>, res: ObserverResponse, cursor?: string) =>
    f.service.observe(principal, observedExecutionId, 'Bearer valid', cursor, res.asExpress());

  it('logs one info line when the lifecycle end was sent, with counts, duration and resumption', async () => {
    const ends = captureObservationEnds();
    const f = observerFixture(initial());
    const res = response();
    const observed = observe(f, res, 'opaque-cursor');
    await vi.advanceTimersByTimeAsync(1_200);
    f.setLoaded(observedRow(initial().state, { status: 'completed', finishedAt: new Date() }));
    await vi.advanceTimersByTimeAsync(500);
    await observed;
    expect(ends).toHaveLength(1);
    expect(ends[0]).toEqual({
      level: 'info',
      record: {
        event: 'execution_observation_ended',
        executionId: observedExecutionId,
        reason: 'terminal',
        durationMs: 1_500,
        events: res.frameNames().length,
        bytes: Buffer.byteLength(res.chunks.join('')),
        resumed: true,
        opened: true,
      },
    });
    expect(JSON.stringify(ends)).not.toContain('SECRET');
  });

  it('logs a client disconnect at info and a legacy snapshot as its own reason', async () => {
    const ends = captureObservationEnds();
    const f = observerFixture(initial());
    const res = response();
    const observed = observe(f, res);
    await vi.advanceTimersByTimeAsync(700);
    res.destroy();
    await observed;
    f.setLoaded(observedRow(initial().state, { responseProfile: 'legacy' }));
    await observe(f, response());
    expect(ends.map(({ level, record }) => [level, record.reason, record.resumed])).toEqual([
      ['info', 'client_disconnected', false],
      ['info', 'legacy_snapshot', false],
    ]);
  });

  it('logs a translation gap at warn with its rule and step kind, never the text', async () => {
    const ends = captureObservationEnds();
    const f = observerFixture(initial());
    const res = response();
    const observed = observe(f, res);
    await vi.advanceTimersByTimeAsync(0);
    const rewritten = projectRuntimeEvent(
      initial().state,
      {
        id: 'source-2',
        event: 'messages/partial',
        data: [{ id: 'native-message', type: 'ai', content: 'OTHER SECRET' }],
      },
      observedInvocationId,
    );
    f.setLoaded(observedRow(rewritten));
    await vi.advanceTimersByTimeAsync(500);
    await observed;
    expect(res.chunks.at(-1)).toBe(
      'event: error\ndata: {"code":"execution_stream_unavailable"}\n\n',
    );
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({
      level: 'warn',
      record: { reason: 'translation_gap', rule: 'answer_not_prefix', stepKind: 'answer' },
    });
    expect(JSON.stringify(ends)).not.toContain('SECRET');
  });

  it('distinguishes token expiry from a failed or hung reauthorization', async () => {
    const ends = captureObservationEnds();
    const expiring = observerFixture(initial());
    expiring.authority.assert.mockResolvedValue(Date.now() + 3_000);
    const first = observe(expiring, response());
    await vi.advanceTimersByTimeAsync(3_000);
    await first;
    const revoked = observerFixture(initial());
    const second = observe(revoked, response());
    await vi.advanceTimersByTimeAsync(0);
    revoked.authority.assert.mockRejectedValue(new UnauthorizedException());
    await vi.advanceTimersByTimeAsync(20_000);
    await second;
    const hung = observerFixture(initial());
    const third = observe(hung, response());
    await vi.advanceTimersByTimeAsync(0);
    hung.authority.assert.mockImplementation(() => new Promise(() => undefined));
    await vi.advanceTimersByTimeAsync(25_000);
    await third;
    expect(ends.map(({ level, record }) => [level, record.reason])).toEqual([
      ['info', 'token_expired'],
      ['warn', 'reauthorization_failed'],
      ['warn', 'reauthorization_failed'],
    ]);
  });

  it('reports a bounded read that timed out apart from other errors, named by class only', async () => {
    const ends = captureObservationEnds();
    const slow = observerFixture(initial());
    const first = observe(slow, response());
    await vi.advanceTimersByTimeAsync(0);
    slow.load.mockImplementation(() => new Promise(() => undefined));
    await vi.advanceTimersByTimeAsync(5_500);
    await first;
    const broken = observerFixture(initial());
    const res = response();
    const second = observe(broken, res);
    await vi.advanceTimersByTimeAsync(0);
    broken.load.mockRejectedValue(new TypeError('SECRET provider detail'));
    await vi.advanceTimersByTimeAsync(500);
    await second;
    expect(ends.map(({ level, record }) => [level, record.reason, record.errorName])).toEqual([
      ['warn', 'load_timeout', undefined],
      ['warn', 'error', 'TypeError'],
    ]);
    expect(JSON.stringify(ends)).not.toContain('SECRET');
    expect(res.chunks.join('')).not.toContain('provider detail');
  });

  it('reports the writer bounds and transport failures by their own reasons', async () => {
    const ends = captureObservationEnds();
    const stalled = observerFixture(initial(), { EXECUTION_SSE_DRAIN_TIMEOUT_MS: 1_000 });
    const first = observe(
      stalled,
      response(() => false),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await first;
    const small = observerFixture(initial(), { EXECUTION_SSE_MAX_FRAME_BYTES: 200 });
    await observe(small, response());
    const failing = observerFixture(initial());
    const res = response();
    const third = observe(failing, res);
    await vi.advanceTimersByTimeAsync(0);
    res.emit('error', new Error('socket reset'));
    await third;
    expect(ends.map(({ level, record }) => [level, record.reason])).toEqual([
      ['warn', 'slow_consumer'],
      ['warn', 'frame_too_large'],
      ['warn', 'transport_error'],
    ]);
  });

  it('logs nothing when authority refuses the attach before any header', async () => {
    const ends = captureObservationEnds();
    const f = observerFixture(initial());
    f.authority.assert.mockRejectedValue(new UnauthorizedException());
    const res = response();
    await expect(observe(f, res)).rejects.toThrow(UnauthorizedException);
    expect(res.flushHeaders).not.toHaveBeenCalled();
    expect(ends).toEqual([]);
  });

  it('answers 503 and logs load_timeout when the attach read hangs before any header', async () => {
    const ends = captureObservationEnds();
    const slow = observerFixture(initial());
    slow.load.mockImplementation(() => new Promise(() => undefined));
    const res = response();
    const refused = observe(slow, res, 'opaque-cursor').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5_000);
    // Transient unavailability, retried with backoff; not an authentication refusal.
    const error = await refused;
    expect(error).toBeInstanceOf(ApiException);
    expect(error).toMatchObject({
      status: 503,
      code: EXECUTION_STREAM_UNAVAILABLE_CODE,
    });
    expect(res.flushHeaders).not.toHaveBeenCalled();
    expect(ends).toEqual([
      {
        level: 'warn',
        record: {
          event: 'execution_observation_ended',
          executionId: observedExecutionId,
          reason: 'load_timeout',
          durationMs: 5_000,
          events: 0,
          bytes: 0,
          resumed: true,
          opened: false,
        },
      },
    ]);
  });

  it('skips a stale running read but ends at once on a settled row below the revision sent', async () => {
    const ends = captureObservationEnds();
    const chunk = (index: number): RuntimeEvent => ({
      id: `${1_789_567_000_000 + index}-0`,
      event: 'messages',
      data: [{ id: 'm', type: 'AIMessageChunk', content: `mot${index} ` }, {}],
    });
    const upTo = (count: number, extra: RuntimeEvent[] = []) =>
      [...Array.from({ length: count }, (_, index) => chunk(index)), ...extra].reduce(
        (state, event) => projectRuntimeEvent(state, event, observedInvocationId),
        emptyProjection(),
      );
    const f = observerFixture(observedRow(upTo(10)));
    const res = response();
    const observed = observe(f, res);
    await vi.advanceTimersByTimeAsync(0);
    const sent = res.frameNames().length;
    f.setLoaded(observedRow(upTo(4)));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(res.frameNames()).toHaveLength(sent);
    expect(res.writableEnded).toBe(false);
    // Lost commits: the terminal row settled with fewer events than the observer was sent.
    const settled = observedRow(upTo(5, [chunk(9)]), {
      status: 'completed',
      finishedAt: new Date(),
    });
    f.setLoaded(settled);
    await vi.advanceTimersByTimeAsync(500);
    await observed;
    expect(res.chunks.at(-1)).toBe(
      'event: error\ndata: {"code":"execution_stream_unavailable"}\n\n',
    );
    expect(ends.map(({ level, record }) => [level, record.reason, record.durationMs])).toEqual([
      ['warn', 'revision_regressed', 1_500],
    ]);
    // The browser re-attaches and receives the settled row with its lifecycle end.
    const again = response();
    await observe(f, again);
    await expect(again.verified()).resolves.toBe(1);
    expect(again.frameNames().at(-1)).toBe('RUN_FINISHED');
    expect(ends.at(-1)).toMatchObject({ level: 'info', record: { reason: 'terminal' } });
  });
});

describe('observation end classification', () => {
  it('keeps the first cause and maps writer and error causes to stable codes', () => {
    const ending = new ObservationEnding();
    ending.record(null);
    ending.record({ reason: 'token_expired' });
    ending.record(writerEnd('disconnected'));
    expect(ending.current).toEqual({ reason: 'token_expired' });
    expect(writerEnd('aborted')).toEqual({ reason: 'client_disconnected' });
    expect(writerEnd('closed')).toBeNull();
    expect(writerEnd(null)).toBeNull();
    expect(errorEnd(new AgUiTranslationGap('reshaped', 'tool'))).toEqual({
      reason: 'translation_gap',
      rule: 'reshaped',
      stepKind: 'tool',
    });
    expect(errorEnd(new ObservationLoadTimeout())).toEqual({ reason: 'load_timeout' });
    expect(errorEnd(new ObservationRevisionRegressed())).toEqual({
      reason: 'revision_regressed',
    });
    expect(observationEndLevel({ reason: 'revision_regressed' })).toBe('warn');
    expect(errorEnd('text')).toEqual({ reason: 'error', errorName: 'string' });
    const Anonymous = [class extends Error {}][0]!;
    expect(errorEnd(new Anonymous())).toEqual({ reason: 'error', errorName: 'Error' });
    expect(observationEndLevel({ reason: 'client_disconnected' })).toBe('info');
    expect(observationEndLevel({ reason: 'invalid_frame' })).toBe('warn');
  });
});
