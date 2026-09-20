import type { ExecutionSnapshot } from '@alfred/contracts';
import { EventType } from '@ag-ui/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatSessionProvider } from '@/contexts/chat-session/chat-session-provider';
import { useConversationChat } from '@/hooks/conversations/use-conversation-chat';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import {
  createExecution,
  getActiveExecution,
  getExecution,
  listMessages,
  observeExecution,
  stopExecution,
} from '@/services/executions/executions.service';
import type * as RecoveryModule from '@/services/executions/recovery';
import { ApiRequestError } from '@/services/http/api-json';
import { synthesizeFrames, synthesizeRun, type AgUiFrame } from '../../../support/ag-ui-synth';
import { snapshot } from '../../../support/executions-api';
import { CONVERSATION_ID, STANDALONE_CONVERSATION_ID } from '../../../support/workspace-api';

vi.mock('@/hooks/workspace/use-workspace-account');
vi.mock('@/services/executions/executions.service');
vi.mock('@/services/executions/recovery', async (original) => ({
  ...(await original<typeof RecoveryModule>()),
  recoveryDelay: vi.fn().mockResolvedValue(undefined),
}));

const create = vi.mocked(createExecution);
const observe = vi.mocked(observeExecution);
const stop = vi.mocked(stopExecution);
const active = vi.mocked(getActiveExecution);
const get = vi.mocked(getExecution);
const history = vi.mocked(listMessages);
const FIRST = snapshot();
const SECOND = snapshot({
  conversation: { ...FIRST.conversation, id: STANDALONE_CONVERSATION_ID },
  execution: {
    ...FIRST.execution,
    id: '55555555-5555-4555-8555-555555555555',
    conversationId: STANDALONE_CONVERSATION_ID,
  },
  userMessage: 'Second request',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function frame(base: ExecutionSnapshot, revision: number, text: string): ExecutionSnapshot {
  return { ...base, revision, cursor: `${base.execution.id}:${revision}`, assistantText: text };
}

/** AG-UI batches for consecutive committed projections, as the API translates them. */
const batches = (...snapshots: readonly ExecutionSnapshot[]) => synthesizeRun(snapshots);

/** Each gate represents a network delivery of one batch; ignoring abort models a queued callback. */
function stream(events: readonly (readonly AgUiFrame[])[], ignoreAbort = false) {
  const gates = events.map(() => deferred<void>());
  const ended = deferred<void>();
  let signal: AbortSignal | undefined;
  const implementation = async function* (_client: unknown, _id: string, current: AbortSignal) {
    signal = current;
    const aborted = new Promise<void>((resolve) => {
      if (current.aborted) resolve();
      else current.addEventListener('abort', () => resolve(), { once: true });
    });
    try {
      for (const [index, batch] of events.entries()) {
        await (ignoreAbort
          ? gates[index]!.promise
          : Promise.race([gates[index]!.promise, aborted]));
        if (current.aborted && !ignoreAbort) return;
        for (const item of batch) yield item;
      }
      if (!current.aborted) await aborted;
    } finally {
      ended.resolve();
    }
  };
  return {
    implementation,
    release: (index: number) => gates[index]!.resolve(),
    ended: ended.promise,
    signal: () => signal,
  };
}

function renderChat() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ChatSessionProvider>{children}</ChatSessionProvider>
    </QueryClientProvider>
  );
  return {
    ...renderHook(({ id }) => useConversationChat(id), {
      initialProps: { id: CONVERSATION_ID },
      wrapper,
    }),
    queryClient,
  };
}

async function ready(view: ReturnType<typeof renderChat>, id?: string) {
  if (id) view.rerender({ id });
  await waitFor(() => expect(view.result.current.status).toBe('ready'));
}

beforeEach(() => {
  vi.mocked(useWorkspaceAccount).mockReturnValue({
    client: { request: vi.fn() },
    userId: 'user-1',
  });
  history.mockResolvedValue([]);
  active.mockResolvedValue(null);
  get.mockResolvedValue(FIRST);
  create.mockResolvedValue(FIRST);
  stop.mockResolvedValue({ ...FIRST, execution: { ...FIRST.execution, status: 'stopping' } });
});

describe('chat recovery race regressions', () => {
  it('remembers Stop before the creation acknowledgement and sends it once to the accepted execution', async () => {
    const accepted = deferred<ExecutionSnapshot>();
    create.mockReturnValue(accepted.promise);
    observe.mockImplementation(stream([]).implementation);
    const view = renderChat();
    await ready(view);
    act(() => {
      expect(view.result.current.send('First')).toBe(true);
      view.result.current.stop();
      view.result.current.stop();
    });
    expect(view.result.current.live?.stopPending).toBe(true);
    expect(stop).not.toHaveBeenCalled();
    await act(async () => {
      accepted.resolve(FIRST);
      await accepted.promise;
    });
    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(stop.mock.calls[0]?.[1]).toBe(FIRST.execution.id);
    expect(create).toHaveBeenCalledOnce();
    expect(view.result.current.send('Duplicate')).toBe(false);
  });

  it('deduplicates Stop while its response is pending and does not roll it back on a queued running snapshot', async () => {
    const response = deferred<ExecutionSnapshot>();
    const events = stream(batches(frame(FIRST, 0, '')));
    stop.mockReturnValue(response.promise);
    observe.mockImplementation(events.implementation);
    const view = renderChat();
    await ready(view);
    act(() => {
      view.result.current.send('First');
    });
    await waitFor(() => expect(observe).toHaveBeenCalledOnce());
    act(() => {
      for (let index = 0; index < 5; index += 1) view.result.current.stop();
    });
    expect(stop).toHaveBeenCalledOnce();
    await act(async () => {
      response.resolve({ ...FIRST, execution: { ...FIRST.execution, status: 'stopping' } });
      await response.promise;
    });
    act(() => events.release(0));
    await waitFor(() => expect(view.result.current.live?.execution?.status).toBe('stopping'));
    expect(view.result.current.live?.stopPending).toBe(true);
    expect(events.signal()?.aborted).toBe(false);
  });

  it('does not reopen a cancelled execution when an already queued newer running snapshot arrives', async () => {
    const events = stream(batches(frame(FIRST, 5, 'Incorrect reopening')));
    observe.mockImplementation(events.implementation);
    stop.mockResolvedValue({ ...FIRST, execution: { ...FIRST.execution, status: 'cancelled' } });
    const view = renderChat();
    await ready(view);
    act(() => {
      view.result.current.send('First');
    });
    await waitFor(() => expect(observe).toHaveBeenCalledOnce());
    // Keep handover pending so the assertion observes the settled live turn.
    history.mockReturnValue(new Promise(() => undefined));
    act(() => view.result.current.stop());
    await waitFor(() => expect(view.result.current.live?.status).toBe('done'));
    act(() => events.release(0));
    await act(async () => Promise.resolve());
    expect(view.result.current.live?.execution?.status).toBe('cancelled');
    expect(view.result.current.live?.assistantText).toBe('');
    expect(view.result.current.isStreaming).toBe(false);
  });

  it('keeps one observer when reload is clicked repeatedly while the stream is already open', async () => {
    const events = stream(batches(frame(FIRST, 1, 'Still connected')));
    observe.mockImplementation(events.implementation);
    const view = renderChat();
    await ready(view);
    act(() => {
      view.result.current.send('First');
    });
    await waitFor(() => expect(observe).toHaveBeenCalledOnce());
    act(() => {
      for (let index = 0; index < 8; index += 1) view.result.current.reload();
      events.release(0);
    });
    await waitFor(() => expect(view.result.current.live?.assistantText).toBe('Still connected'));
    expect(observe).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
  });

  it('reuses the original submission after all ambiguous creation retries and an explicit reconnect', async () => {
    create.mockRejectedValue(new TypeError('Connection lost after server acceptance'));
    const view = renderChat();
    await ready(view);
    act(() => {
      view.result.current.send('First');
    });
    await waitFor(() => expect(view.result.current.live?.connection).toBe('disconnected'));
    expect(create).toHaveBeenCalledTimes(6);
    create.mockResolvedValue(FIRST);
    observe.mockImplementation(stream([]).implementation);
    act(() => view.result.current.reload());
    await waitFor(() => expect(observe).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledTimes(7);
    expect(new Set(create.mock.calls.map((call) => call[3])).size).toBe(1);
    expect(view.result.current.sessions).toHaveLength(1);
  });

  it('keeps the accepted replay cursor when reconciliation returns an older snapshot', async () => {
    const next = stream(batches(frame(FIRST, 5, 'Recovered')));
    observe
      .mockImplementationOnce(async function* () {
        for (const item of synthesizeFrames(null, frame(FIRST, 4, 'Partial')))
          yield await Promise.resolve(item);
      })
      .mockImplementationOnce(next.implementation);
    get.mockResolvedValue({ ...FIRST, revision: 2, cursor: 'outdated', assistantText: 'Old' });
    const view = renderChat();
    await ready(view);
    act(() => {
      view.result.current.send('First');
    });
    await waitFor(() => expect(observe).toHaveBeenCalledTimes(2));
    expect(observe.mock.calls[1]?.[3]).toBe(`${FIRST.execution.id}:4`);
    expect(view.result.current.live?.assistantText).toBe('Partial');
    act(() => next.release(0));
    await waitFor(() => expect(view.result.current.live?.assistantText).toBe('Recovered'));
    expect(create).toHaveBeenCalledOnce();
  });

  it('fails closed on the state of another execution without retrying or erasing the last good text', async () => {
    const foreign: AgUiFrame = {
      event: {
        type: EventType.STATE_SNAPSHOT,
        snapshot: {
          execution: { ...SECOND.execution, conversationId: FIRST.execution.conversationId },
          conversation: FIRST.conversation,
          userMessage: FIRST.userMessage,
        },
      },
    };
    const events = stream([synthesizeFrames(null, frame(FIRST, 1, 'Trusted')), [foreign]]);
    observe.mockImplementation(events.implementation);
    const view = renderChat();
    await ready(view);
    act(() => {
      view.result.current.send('First');
      events.release(0);
    });
    await waitFor(() => expect(view.result.current.live?.assistantText).toBe('Trusted'));
    act(() => events.release(1));
    await waitFor(() => expect(view.result.current.live?.connection).toBe('disconnected'));
    expect(view.result.current.live?.assistantText).toBe('Trusted');
    expect(observe).toHaveBeenCalledOnce();
    expect(get).not.toHaveBeenCalled();
    expect(view.result.current.send('Duplicate')).toBe(false);
  });

  it('fails closed on an AG-UI protocol violation reported by the official verifier, without a retry', async () => {
    const outOfOrder: AgUiFrame = {
      event: { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'never-opened', delta: 'x' },
    };
    const events = stream([synthesizeFrames(null, frame(FIRST, 1, 'Trusted')), [outOfOrder]]);
    observe.mockImplementation(events.implementation);
    const view = renderChat();
    await ready(view);
    act(() => {
      view.result.current.send('First');
      events.release(0);
    });
    await waitFor(() => expect(view.result.current.live?.assistantText).toBe('Trusted'));
    act(() => events.release(1));
    await waitFor(() => expect(view.result.current.live?.connection).toBe('disconnected'));
    expect(view.result.current.live?.assistantText).toBe('Trusted');
    expect(observe).toHaveBeenCalledOnce();
    expect(get).not.toHaveBeenCalled();
  });

  it('keeps reversed creation acknowledgements and subsequent output in their own conversations', async () => {
    const first = deferred<ExecutionSnapshot>();
    const second = deferred<ExecutionSnapshot>();
    const firstEvents = stream(batches(frame(FIRST, 1, 'First answer')));
    const secondEvents = stream(batches(frame(SECOND, 1, 'Second answer')));
    create.mockImplementation((_client, id) => (id === CONVERSATION_ID ? first : second).promise);
    observe.mockImplementation((client, id, signal) =>
      (id === FIRST.execution.id ? firstEvents : secondEvents).implementation(client, id, signal),
    );
    const view = renderChat();
    await ready(view);
    act(() => {
      view.result.current.send('First request');
    });
    await ready(view, STANDALONE_CONVERSATION_ID);
    act(() => {
      view.result.current.send('Second request');
    });
    await act(async () => {
      second.resolve(SECOND);
      await second.promise;
    });
    act(() => secondEvents.release(0));
    await waitFor(() => expect(view.result.current.live?.assistantText).toBe('Second answer'));
    await act(async () => {
      first.resolve(FIRST);
      await first.promise;
    });
    act(() => firstEvents.release(0));
    await waitFor(() => expect(observe).toHaveBeenCalledTimes(2));
    expect(view.result.current.live?.assistantText).toBe('Second answer');
    await ready(view, CONVERSATION_ID);
    await waitFor(() => expect(view.result.current.live?.assistantText).toBe('First answer'));
    expect(view.result.current.sessions).toHaveLength(1);
    expect(new Set(create.mock.calls.map((call) => call[3])).size).toBe(2);
  });

  it.each([401, 403, 404])(
    'isolates a non-retryable %s stream failure from another chat',
    async (status) => {
      const secondEvents = stream(batches(frame(SECOND, 1, 'Second stays usable')));
      create.mockImplementation((_client, id) =>
        Promise.resolve(id === CONVERSATION_ID ? FIRST : SECOND),
      );
      observe.mockImplementation((client, id, signal) => {
        if (id === SECOND.execution.id) return secondEvents.implementation(client, id, signal);
        return (async function* () {
          for (const item of synthesizeFrames(null, frame(FIRST, 1, 'Saved partial')))
            yield await Promise.resolve(item);
          throw new ApiRequestError(status, 'execution_unavailable', 'Unavailable');
        })();
      });
      const view = renderChat();
      await ready(view);
      act(() => {
        view.result.current.send('First');
      });
      await waitFor(() => expect(view.result.current.live?.connection).toBe('disconnected'));
      await ready(view, STANDALONE_CONVERSATION_ID);
      act(() => {
        expect(view.result.current.send('Second')).toBe(true);
        secondEvents.release(0);
      });
      await waitFor(() =>
        expect(view.result.current.live?.assistantText).toBe('Second stays usable'),
      );
      expect(view.result.current.live?.connection).toBe('connected');
      expect(view.result.current.live?.error).toBeNull();
      expect(get).not.toHaveBeenCalled();
      expect(observe).toHaveBeenCalledTimes(2);
      await ready(view, CONVERSATION_ID);
      expect(view.result.current.live?.assistantText).toBe('Saved partial');
      expect(view.result.current.live?.connection).toBe('disconnected');
    },
  );

  it('ignores an old account event even when its transport delivers after cancellation', async () => {
    const late = stream(batches(frame(FIRST, 1, 'Private prior account answer')), true);
    observe.mockImplementation(late.implementation);
    const view = renderChat();
    await ready(view);
    act(() => {
      view.result.current.send('First');
    });
    await waitFor(() => expect(observe).toHaveBeenCalledOnce());
    const previousCache = view.queryClient.getQueryData([
      'conversations',
      'user-1',
      'detail',
      CONVERSATION_ID,
    ]);
    vi.mocked(useWorkspaceAccount).mockReturnValue({
      client: { request: vi.fn() },
      userId: 'user-2',
    });
    await ready(view, CONVERSATION_ID);
    expect(late.signal()?.aborted).toBe(true);
    await act(async () => {
      late.release(0);
      await late.ended;
    });
    expect(view.result.current.sessions).toHaveLength(0);
    expect(view.result.current.messages).toEqual([]);
    expect(
      view.queryClient.getQueryData(['conversations', 'user-1', 'detail', CONVERSATION_ID]),
    ).toEqual(previousCache);
    expect(
      view.queryClient.getQueryData(['conversations', 'user-2', 'detail', CONVERSATION_ID]),
    ).toBeUndefined();
    expect(stop).not.toHaveBeenCalled();
  });

  it('does not attach discovery that finishes after navigation to another conversation', async () => {
    const discovery = deferred<ExecutionSnapshot>();
    active.mockImplementation((_client, id) =>
      id === CONVERSATION_ID ? discovery.promise : Promise.resolve(null),
    );
    observe.mockImplementation(stream([]).implementation);
    const view = renderChat();
    await waitFor(() => expect(active).toHaveBeenCalledOnce());
    await ready(view, STANDALONE_CONVERSATION_ID);
    await act(async () => {
      discovery.resolve(FIRST);
      await discovery.promise;
    });
    expect(view.result.current.sessions).toHaveLength(0);
    expect(observe).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(view.result.current.isStreaming).toBe(false);
  });
});
