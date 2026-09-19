import { EventType } from '@ag-ui/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  emptyProjection,
  normalizeProjection,
  projectionText,
  projectRuntimeEvent,
} from '@api/modules/executions/infrastructure/langgraph/runtime-projection';
import { projectionWork } from '@api/modules/executions/infrastructure/langgraph/runtime-projection-work';
import { parseAgUiChunks } from '../../../support/ag-ui-frames';
import { glmLikeRun } from '../../../support/glm-like-run';
import {
  observationHarness,
  paced,
  readNativeCapture,
  type HarnessOptions,
  type PacedFrame,
} from '../../../support/observation-harness';
import { captureObservationEnds, observedInvocationId } from '../../../support/observer-fixture';

// Bind promise-based Node delays to the fake clock that drives the worker and the observers.
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

type Harness = ReturnType<typeof observationHarness>;
type Attached = ReturnType<Harness['attach']>;

/** The orchestrator's answer as a browser accumulates it: the last message no specialist owns. */
function answerText(attached: Attached): string {
  let current: string | null = null;
  let text = '';
  for (const frame of parseAgUiChunks(attached.response.chunks)) {
    if (frame.kind !== 'agui') continue;
    const { event } = frame;
    if (event.type === EventType.TEXT_MESSAGE_START && event.subagentRunId === undefined) {
      current = event.messageId;
      text = '';
    } else if (event.type === EventType.TEXT_MESSAGE_CONTENT && event.messageId === current) {
      text += event.delta;
    }
  }
  return text;
}

function lastCursor(attached: Attached): string | undefined {
  for (const frame of parseAgUiChunks(attached.response.chunks).reverse())
    if (frame.kind === 'agui' && frame.id !== undefined) return frame.id;
  return undefined;
}

/**
 * Drives the worker and four observers on the fake clock: A from the start, D attached then
 * disconnected, B attached during the first long tool call, C resuming A's cursor later on.
 */
async function observeRun(
  frames: readonly PacedFrame[],
  stepMs: number,
  options: HarnessOptions = {},
) {
  const harness = observationHarness(frames, options);
  const durationMs = frames.reduce((total, frame) => total + frame.pauseMs, 0);
  const a = harness.attach();
  const observers: { a: Attached; b?: Attached; c?: Attached; d?: Attached } = { a };
  let processed = false;
  const processing = harness.process().finally(() => {
    processed = true;
  });
  const actions = [
    { at: durationMs * 0.15, act: () => (observers.d = harness.attach()) },
    { at: durationMs * 0.2, act: () => (observers.b = harness.attach()) },
    { at: durationMs * 0.25, act: () => observers.d?.response.destroy() },
    { at: durationMs * 0.7, act: () => (observers.c = harness.attach(lastCursor(a))) },
  ];
  const finishedEarly: string[] = [];
  const start = Date.now();
  const open = () =>
    [a, observers.b, observers.c].some(
      (observer) => observer === undefined || observer.endedAt() === null,
    );
  for (let guard = 0; !processed || actions.length > 0 || open(); guard += 1) {
    if (guard > 200_000) throw new Error('The run did not settle');
    await vi.advanceTimersByTimeAsync(stepMs);
    while (actions.length > 0 && actions[0]!.at <= Date.now() - start) actions.shift()!.act();
    const completed = harness.commits.some((commit) => commit.status === 'completed');
    for (const [name, observer] of Object.entries(observers))
      if (!completed && observer?.response.frameNames().includes('RUN_FINISHED'))
        finishedEarly.push(name);
  }
  await processing;
  await Promise.all([a.done, observers.b?.done, observers.c?.done, observers.d?.done]);
  return { harness, observers, finishedEarly, frames };
}

async function expectSettledObservation(
  run: Awaited<ReturnType<typeof observeRun>>,
  ends: ReturnType<typeof captureObservationEnds>,
) {
  const { harness, observers, finishedEarly, frames } = run;
  expect(harness.row().status).toBe('completed');
  // Every native event reached the durable row: none was reduced against an older commit.
  const expected = frames.reduce(
    (state, { frame }) => projectRuntimeEvent(state, frame, observedInvocationId),
    emptyProjection(),
  );
  const stored = normalizeProjection(harness.row().reducerState)!;
  expect(
    stored.sequence,
    'native events reduced against the row before an in-flight commit were lost',
  ).toBe(expected.sequence);
  expect(harness.row().publicText).toBe(projectionText(expected));
  expect(stored).toEqual(expected);
  const revisions = harness.commits.map((commit) => commit.revision);
  expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
  const terminalAt = harness.commits.find((commit) => commit.status === 'completed')!.at;
  expect(finishedEarly).toEqual([]);
  for (const observer of [observers.a, observers.b!, observers.c!]) {
    await expect(observer.response.verified()).resolves.toBeGreaterThanOrEqual(1);
    expect(observer.endedAt()).toBeGreaterThanOrEqual(terminalAt);
    const names = observer.response.frameNames();
    expect(names.at(-1)).toBe('RUN_FINISHED');
    expect(names.filter((name) => name === 'RUN_STARTED')).toHaveLength(1);
    expect(observer.response.chunks.join('')).not.toContain('event: error');
    expect(answerText(observer)).toBe(harness.row().publicText);
  }
  await expect(observers.d!.response.verified()).resolves.toBe(1);
  expect(ends.every((end) => end.level === 'info')).toBe(true);
  expect(ends.map(({ record }) => `${record.reason}:${record.resumed}`).sort()).toEqual([
    'client_disconnected:false',
    'terminal:false',
    'terminal:false',
    'terminal:true',
  ]);
  const wire = [observers.a, observers.b!, observers.c!, observers.d!]
    .flatMap((observer) => observer.response.chunks)
    .join('');
  expect(wire).not.toContain('PRIVATE');
}

describe('execution observation end to end: worker commits and SSE observers together', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T14:01:50Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps every observer attached until RUN_FINISHED through a GLM-shaped delegation run', async () => {
    const ends = captureObservationEnds();
    const run = await observeRun(glmLikeRun(), 100);
    await expectSettledObservation(run, ends);
    // Every specialist nests under its own delegation, in the live stream and in the stored log.
    const events = parseAgUiChunks(run.observers.a.response.chunks).flatMap((frame) =>
      frame.kind === 'agui' && frame.event.type === EventType.SUBAGENT_STARTED ? [frame.event] : [],
    );
    expect(events).toHaveLength(4);
    expect(events.every((event) => event.parentToolCallId === event.subagentRunId)).toBe(true);
    const stored = normalizeProjection(run.harness.row().reducerState)!;
    const work = projectionWork(stored, { settled: true, endedAt: Date.now() });
    const delegations = work.steps.filter((step) => step.kind === 'delegation');
    expect(work.steps.filter((step) => step.kind === 'subagent')).toEqual([]);
    expect(delegations.map((step) => step.subagentStatus)).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
    ]);
    for (const delegation of delegations)
      expect(work.steps.some((step) => step.parentId === delegation.id)).toBe(true);
    // The long tool calls produced no commit: nothing changed, nothing was written.
    const quiet = run.harness.commits.filter(
      (commit, index, all) => index > 0 && commit.at - all[index - 1]!.at >= 5_000,
    );
    expect(quiet.length).toBeGreaterThanOrEqual(2);
  }, 60_000);

  // A real database write takes time: native events keep arriving while a window commit is in
  // flight. Each must build on that commit, or events are lost and commits go backwards.
  it.each([
    { commitMs: 25, readMs: 5 },
    { commitMs: 150, readMs: 20 },
  ])(
    'loses no event and keeps every observer attached when commits take $commitMs ms',
    async (latency) => {
      const ends = captureObservationEnds();
      const run = await observeRun(glmLikeRun(), 100, latency);
      await expectSettledObservation(run, ends);
    },
    60_000,
  );
});

const captures = (process.env.ALFRED_OBSERVATION_CAPTURES ?? '')
  .split(',')
  .map((path) => path.trim())
  .filter((path) => path !== '');

/** Durable write latency of the local replay, 20 ms unless `ALFRED_OBSERVATION_COMMIT_MS` says. */
const commitMs = () => {
  const value = Number(process.env.ALFRED_OBSERVATION_COMMIT_MS ?? 20);
  return Number.isFinite(value) && value >= 0 ? value : 20;
};

// Local only: replays real native captures (never committed: they hold user data) on demand.
describe.skipIf(captures.length === 0)(
  'execution observation replay of local native captures',
  () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-16T14:01:50Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it.each(captures)(
      'keeps every observer attached until RUN_FINISHED for %s',
      async (path) => {
        const ends = captureObservationEnds();
        const run = await observeRun(paced(readNativeCapture(path)), 500, {
          commitMs: commitMs(),
          readMs: 5,
        });
        await expectSettledObservation(run, ends);
      },
      900_000,
    );
  },
);
