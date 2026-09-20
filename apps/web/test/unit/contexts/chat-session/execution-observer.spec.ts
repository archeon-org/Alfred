import type { ExecutionSnapshot, WorkStep } from '@alfred/contracts';
import { EventType } from '@ag-ui/core';
import { QueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatSessionAction } from '@/contexts/chat-session/chat-session-state';
import type { LiveTurn } from '@/contexts/chat-session/chat-session-context';
import { createExecutionObserver } from '@/contexts/chat-session/execution-observer';
import { contentExtent } from '@/contexts/chat-session/turn-publisher';
import { captureRuntimeEvent, reportRuntimeEventFault } from '@/lib/workspace/runtime-event-debug';
import {
  createExecution,
  getExecution,
  listMessages,
  observeExecution,
} from '@/services/executions/executions.service';
import type * as RecoveryModule from '@/services/executions/recovery';
import { reattachDelay, RECOVERY_ATTEMPTS, recoveryDelay } from '@/services/executions/recovery';
import type * as DebugModule from '@/lib/workspace/runtime-event-debug';
import { ApiRequestError } from '@/services/http/api-json';
import { synthesizeFrames, type AgUiFrame } from '../../../support/ag-ui-synth';
import { execution, snapshot } from '../../../support/executions-api';
import { CONVERSATION_ID } from '../../../support/workspace-api';

vi.mock('@/services/executions/executions.service');
vi.mock('@/services/executions/recovery', async (original) => ({
  ...(await original<typeof RecoveryModule>()),
  recoveryDelay: vi.fn().mockResolvedValue(undefined),
  reattachDelay: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/workspace/runtime-event-debug', async (original) => ({
  ...(await original<typeof DebugModule>()),
  captureRuntimeEvent: vi.fn(),
  reportRuntimeEventFault: vi.fn(),
}));

const observe = vi.mocked(observeExecution);
const read = vi.mocked(getExecution);
const DISCONNECTED = /Connexion interrompue/;

const reasoning = (index: number): WorkStep => ({
  id: `r${index}`,
  kind: 'reasoning',
  label: '',
  status: 'completed',
  startedAt: 1_000 + index,
  finishedAt: 1_500 + index,
  text: `Réflexion ${index}.`,
});

/** The run after `count` commits: one more reasoning step and a longer answer each time. */
function commit(count: number, status: ExecutionSnapshot['execution']['status'] = 'running') {
  return snapshot({
    revision: count,
    cursor: `cursor:${count}`,
    assistantText: 'Mot '.repeat(count),
    work: { steps: Array.from({ length: count }, (_, index) => reasoning(index)), omittedSteps: 0 },
    execution: execution(status),
  });
}

/** One attach: the replay of the run at `from`, then the changes up to `to`, then the end. */
function attach(from: ExecutionSnapshot, to: readonly ExecutionSnapshot[], end?: Error) {
  const frames: AgUiFrame[] = synthesizeFrames(null, from);
  let previous = from;
  for (const next of to) {
    frames.push(...synthesizeFrames(previous, next));
    previous = next;
  }
  return async function* (_client: unknown, _id: string, signal: AbortSignal) {
    for (const frame of frames) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      await Promise.resolve();
      yield frame;
    }
    if (end !== undefined) throw end;
  };
}

/** An attach the API refuses before its first frame, as a 503 before headers. */
function refused(error: Error) {
  return async function* (): AsyncGenerator<AgUiFrame> {
    await Promise.resolve();
    yield* [];
    throw error;
  };
}

function launch() {
  const turns: LiveTurn[] = [];
  const controller = new AbortController();
  const observer = createExecutionObserver({
    client: { request: vi.fn() },
    conversationId: CONVERSATION_ID,
    controller,
    dispatch: (action: ChatSessionAction) => {
      if (action.type === 'update') turns.push(action.turn);
    },
    id: 1,
    onClose: vi.fn(),
    queryClient: new QueryClient(),
    text: 'Salut',
    userId: 'user-1',
  });
  observer.start();
  return { controller, observer, turns, last: () => turns.at(-1) };
}

beforeEach(() => {
  // Implementations outlive `clearMocks`: every test starts from plain mocks.
  for (const mock of [observe, read, vi.mocked(captureRuntimeEvent)]) mock.mockReset();
  vi.mocked(createExecution).mockResolvedValue(snapshot());
  vi.mocked(listMessages).mockResolvedValue([]);
});

describe('execution observer recovery', () => {
  it('never gives up on a live run whose observation keeps closing after progress', async () => {
    const closes = 10;
    for (let index = 0; index < closes; index += 1)
      observe.mockImplementationOnce(
        attach(
          commit(index),
          [commit(index + 1)],
          index % 2 === 0
            ? undefined
            : new ApiRequestError(503, 'execution_stream_unavailable', 'Indisponible'),
        ),
      );
    observe.mockImplementationOnce(attach(commit(closes), [commit(closes + 1, 'completed')]));
    for (let index = 1; index <= closes; index += 1) read.mockResolvedValueOnce(commit(index));
    const view = launch();
    await waitFor(() => expect(view.last()?.status).toBe('done'));
    expect(observe).toHaveBeenCalledTimes(closes + 1);
    expect(read).toHaveBeenCalledTimes(closes);
    expect(reattachDelay).toHaveBeenCalledTimes(closes);
    expect(recoveryDelay).not.toHaveBeenCalled();
    expect(
      view.turns.some(
        (turn) => turn.connection !== 'connected' && turn.connection !== 'connecting',
      ),
    ).toBe(false);
    // Re-attaching never shows less than before: the replay replaces the view once caught up.
    const extents = view.turns.map((turn) => contentExtent(turn));
    expect(extents.every((extent, index) => index === 0 || extent >= extents[index - 1]!)).toBe(
      true,
    );
    expect(view.last()?.assistantText).toBe('Mot '.repeat(closes + 1));
  });

  it('counts a new step as progress even when a long answer became shorter narration', async () => {
    const tool = (index: number): WorkStep => ({
      id: `t${index}`,
      kind: 'tool',
      label: 'search',
      status: 'completed',
      startedAt: 3_000 + index,
      finishedAt: 3_500 + index,
    });
    const narration: WorkStep = {
      id: 'm1',
      kind: 'message',
      label: '',
      status: 'completed',
      startedAt: 1_000,
      finishedAt: 2_000,
      text: `${'x'.repeat(3_999)}…`,
    };
    // A 10 000-character intermediate answer, then its bounded narration and one tool per commit.
    const run = (count: number, status: ExecutionSnapshot['execution']['status'] = 'running') =>
      snapshot({
        revision: count,
        cursor: `cursor:${count}`,
        assistantText: count === 0 ? 'x'.repeat(10_000) : 'Suite',
        work: {
          steps:
            count === 0 ? [] : [narration, ...Array.from({ length: count }, (_, i) => tool(i))],
          omittedSteps: 0,
        },
        execution: execution(status),
      });
    const offline = new TypeError('offline');
    const attaches = 8;
    for (let index = 0; index < attaches; index += 1)
      observe.mockImplementationOnce(attach(run(index), [], offline));
    observe.mockImplementationOnce(attach(run(attaches), [run(attaches + 1, 'completed')]));
    for (let index = 0; index < attaches; index += 1) read.mockResolvedValueOnce(run(index));
    const view = launch();
    await waitFor(() => expect(view.last()?.status).toBe('done'));
    expect(observe).toHaveBeenCalledTimes(attaches + 1);
    expect(view.turns.some((turn) => turn.connection === 'disconnected')).toBe(false);
    expect(recoveryDelay).not.toHaveBeenCalled();
  });

  it('shows the omitted steps the stream reports, which it never sends one by one', async () => {
    const bounded = (count: number, omittedSteps: number, status = 'running' as const) =>
      snapshot({
        ...commit(count),
        work: { ...commit(count).work!, omittedSteps },
        execution: execution(status),
      });
    observe.mockImplementationOnce(
      attach(bounded(1, 0), [
        bounded(1, 2),
        { ...bounded(2, 5), execution: execution('completed') },
      ]),
    );
    const view = launch();
    await waitFor(() => expect(view.last()?.status).toBe('done'));
    expect(view.turns.some((turn) => turn.work.omittedSteps === 2)).toBe(true);
    expect(view.last()?.work.omittedSteps).toBe(5);
  });

  it('counts only consecutive fruitless attaches, keeps the partial turn and reconnects on demand', async () => {
    observe.mockImplementationOnce(attach(commit(0), [commit(2)]));
    observe.mockImplementation(attach(commit(2), [], new TypeError('offline')));
    read.mockResolvedValue(commit(2));
    const view = launch();
    await waitFor(() => expect(view.last()?.connection).toBe('disconnected'));
    expect(observe).toHaveBeenCalledTimes(7);
    expect(reattachDelay).toHaveBeenCalledOnce();
    expect(recoveryDelay).toHaveBeenCalledTimes(5);
    expect(view.last()).toMatchObject({
      status: 'streaming',
      assistantText: 'Mot Mot ',
      error: expect.stringMatching(DISCONNECTED) as unknown,
    });
    expect(view.last()?.work.steps).toHaveLength(2);
    observe.mockImplementation(attach(commit(2), [commit(3, 'completed')]));
    view.observer.start();
    await waitFor(() => expect(view.last()?.status).toBe('done'));
    expect(view.last()?.error).toBeNull();
    expect(view.last()?.work.steps).toHaveLength(3);
  });

  it('follows a run through its recovery reads while its stream stays unavailable', async () => {
    observe.mockImplementation(
      refused(new ApiRequestError(503, 'execution_stream_unavailable', 'Indisponible')),
    );
    // Far more reads than the budget, each one showing a longer answer, then the confirmed end.
    const reads = RECOVERY_ATTEMPTS * 2;
    for (let index = 1; index < reads; index += 1) read.mockResolvedValueOnce(commit(index));
    read.mockResolvedValueOnce(commit(reads, 'completed'));
    const view = launch();
    await waitFor(() => expect(view.last()?.status).toBe('done'));
    expect(read).toHaveBeenCalledTimes(reads);
    expect(observe).toHaveBeenCalledTimes(reads);
    expect(view.turns.some((turn) => turn.connection === 'disconnected')).toBe(false);
    // The stream never delivered: the attaches keep backing off, never re-attach promptly.
    expect(reattachDelay).not.toHaveBeenCalled();
    expect(vi.mocked(recoveryDelay).mock.calls.map(([attempt]) => attempt)).toEqual(
      Array.from({ length: reads }, (_, attempt) => attempt),
    );
    expect(view.last()?.assistantText).toBe('Mot '.repeat(reads));
  });

  it.each([
    ['repeat the same snapshot', () => commit(2)],
    ['answer older than what was shown', (call: number) => (call === 1 ? commit(3) : commit(1))],
  ])(
    'stops after the budget when its stream is unavailable and its reads %s',
    async (_case, next) => {
      observe.mockImplementation(refused(new TypeError('offline')));
      let calls = 0;
      read.mockImplementation(() => Promise.resolve(next((calls += 1))));
      const view = launch();
      await waitFor(() => expect(view.last()?.connection).toBe('disconnected'));
      // The first read shows the run; only the fruitless attempts after it count.
      expect(read).toHaveBeenCalledTimes(RECOVERY_ATTEMPTS + 1);
      expect(observe).toHaveBeenCalledTimes(RECOVERY_ATTEMPTS + 2);
      expect(view.last()?.status).toBe('streaming');
    },
  );

  it('treats a handler exception as a fruitless attempt reported once, never as a transport loop', async () => {
    vi.mocked(captureRuntimeEvent).mockImplementation((_user, _conversation, event) => {
      if (event.event === 'TEXT_MESSAGE_CONTENT') throw new TypeError('bug');
    });
    // Every attach delivers new work before the handler fails: it still never counts as progress.
    // The reads show nothing new, so only the attaches could have reset the budget.
    let attaches = 0;
    observe.mockImplementation((client, id, signal) => {
      attaches += 1;
      return attach(commit(attaches), [])(client, id, signal);
    });
    read.mockResolvedValue(snapshot());
    const view = launch();
    await waitFor(() => expect(view.last()?.connection).toBe('disconnected'));
    expect(observe).toHaveBeenCalledTimes(6);
    expect(recoveryDelay).toHaveBeenCalledTimes(5);
    expect(reattachDelay).not.toHaveBeenCalled();
    expect(reportRuntimeEventFault).toHaveBeenCalledOnce();
    expect(reportRuntimeEventFault).toHaveBeenCalledWith(
      'user-1',
      CONVERSATION_ID,
      expect.any(TypeError),
    );
  });

  it('fails closed on a frame the contract refuses, without another attach', async () => {
    const replay = synthesizeFrames(null, commit(1));
    observe.mockImplementation(async function* () {
      await Promise.resolve();
      const foreign: AgUiFrame = {
        event: { type: EventType.RUN_STARTED, threadId: 'another-thread', runId: 'run' },
      };
      yield foreign;
      yield* replay;
    });
    const view = launch();
    await waitFor(() => expect(view.last()?.connection).toBe('disconnected'));
    expect(observe).toHaveBeenCalledOnce();
    expect(recoveryDelay).not.toHaveBeenCalled();
  });

  it('keeps the shown work while an interrupted replay is dropped, then rebuilds it from the read', async () => {
    const replay = synthesizeFrames(null, commit(3));
    observe.mockImplementationOnce(attach(commit(0), [commit(3)]));
    observe.mockImplementationOnce(async function* () {
      // The connection drops halfway through the replay.
      for (const frame of replay.slice(0, 4)) {
        await Promise.resolve();
        yield frame;
      }
      throw new TypeError('offline');
    });
    observe.mockImplementation(attach(commit(3), [commit(4, 'completed')]));
    read.mockResolvedValue(commit(3));
    const view = launch();
    await waitFor(() => expect(view.last()?.status).toBe('done'));
    const shown = view.turns.findIndex((turn) => turn.work.steps.length === 3);
    expect(shown).toBeGreaterThan(-1);
    expect(view.turns.slice(shown).every((turn) => turn.work.steps.length >= 3)).toBe(true);
    expect(view.turns.slice(shown).every((turn) => turn.assistantText.length >= 12)).toBe(true);
  });
});
