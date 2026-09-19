import type { ExecutionSnapshot, ExecutionWork } from '@alfred/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversationTranscript } from '@/components/workspace/conversation/conversation-transcript';
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
import { reattachDelay, recoveryDelay } from '@/services/executions/recovery';
import { ApiRequestError } from '@/services/http/api-json';
import { synthesizeRun, type AgUiFrame } from '../../../support/ag-ui-synth';
import { execution, EXECUTION_ID, snapshot } from '../../../support/executions-api';
import { CONVERSATION_ID, STANDALONE_CONVERSATION_ID } from '../../../support/workspace-api';

vi.mock('@/hooks/workspace/use-workspace-account');
vi.mock('@/services/executions/executions.service');
vi.mock('@/services/executions/recovery', async (original) => ({
  ...(await original<typeof RecoveryModule>()),
  recoveryDelay: vi.fn().mockResolvedValue(undefined),
  reattachDelay: vi.fn().mockResolvedValue(undefined),
}));

const mockedList = vi.mocked(listMessages);
const mockedCreate = vi.mocked(createExecution);
const mockedActive = vi.mocked(getActiveExecution);
const mockedGet = vi.mocked(getExecution);
const mockedStream = vi.mocked(observeExecution);
const mockedStop = vi.mocked(stopExecution);

/** One committed public projection; the stream helpers translate them into AG-UI batches. */
function event(
  revision: number,
  assistantText = '',
  status: ExecutionSnapshot['execution']['status'] = 'running',
): ExecutionSnapshot {
  return snapshot({
    revision,
    cursor: `cursor:${revision}`,
    assistantText,
    execution: execution(status, status === 'failed' ? 'L’agent a échoué.' : null),
  });
}

function stored(content: string, role: 'user' | 'assistant', executionId = EXECUTION_ID) {
  return {
    content,
    conversationId: CONVERSATION_ID,
    createdAt: '2026-09-11T09:00:00.000Z',
    executionId,
    id: `33333333-3333-4333-8333-33333333333${role === 'user' ? 1 : 2}`,
    role,
  };
}

function wrapperWith(queryClient: QueryClient) {
  return ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ChatSessionProvider>{children}</ChatSessionProvider>
    </QueryClientProvider>
  );
}

function renderChat(conversationId = CONVERSATION_ID) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    ...renderHook(() => useConversationChat(conversationId), { wrapper: wrapperWith(queryClient) }),
    queryClient,
  };
}

function streamOf(snapshots: readonly ExecutionSnapshot[], failure?: Error) {
  const frames: AgUiFrame[] = synthesizeRun(snapshots).flat();
  return async function* (_client: unknown, _id: string, signal: AbortSignal) {
    for (const item of frames) {
      if (signal.aborted) throw new Error('aborted');
      await Promise.resolve();
      yield item;
    }
    if (failure) throw failure;
  };
}

/** One gate per snapshot: releasing it delivers the whole AG-UI batch of that change. */
function controlledStream(snapshots: readonly ExecutionSnapshot[]) {
  const batches = synthesizeRun(snapshots);
  const gates = batches.map(() => {
    let open = () => undefined as void;
    const promise = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { open, promise };
  });
  let seenSignal: AbortSignal | undefined;
  const implementation = async function* (_client: unknown, _id: string, signal: AbortSignal) {
    seenSignal = signal;
    for (const [index, batch] of batches.entries()) {
      const abort = new Promise<never>((_resolve, reject) => {
        if (signal.aborted) reject(new Error('aborted'));
        else signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
      await Promise.race([gates[index]?.promise, abort]);
      for (const item of batch) yield item;
    }
  };
  return {
    implementation,
    release: (index: number) => gates[index]?.open(),
    signal: () => seenSignal,
  };
}

async function ready(view: ReturnType<typeof renderChat>) {
  await waitFor(() => expect(view.result.current.status).toBe('ready'));
  return view;
}

beforeEach(() => {
  vi.mocked(useWorkspaceAccount).mockReturnValue({
    client: { request: vi.fn() },
    userId: 'user-1',
  });
  mockedList.mockResolvedValue([]);
  mockedActive.mockResolvedValue(null);
  mockedGet.mockResolvedValue(snapshot());
  mockedCreate.mockResolvedValue(snapshot());
  mockedStop.mockResolvedValue(snapshot({ revision: 2, execution: execution('stopping') }));
});
afterEach(() => vi.unstubAllEnvs());

describe('recoverable chat observation', () => {
  it('builds the work log of a live answer from the stream and keeps it on the settled turn', async () => {
    // Diagnostics capture is shared across tests of this file; keep this run out of it.
    vi.stubEnv('VITE_DEBUG_EVENTS', 'false');
    const marker = {
      id: 'r1',
      kind: 'reasoning',
      label: '',
      status: 'completed',
      startedAt: 1_000,
      finishedAt: 1_500,
    } as const;
    const delegation = {
      id: 'task-1',
      kind: 'delegation',
      label: 'task',
      status: 'running',
      startedAt: 2_000,
      finishedAt: null,
      specialist: 'topology_agent',
      subagentStatus: 'running',
    } as const;
    const nested = {
      id: 'call-1',
      kind: 'tool',
      label: 'execute_raw',
      status: 'completed',
      startedAt: 2_100,
      finishedAt: 2_400,
      parentId: 'task-1',
    } as const;
    const working: ExecutionWork = { steps: [marker, delegation, nested], omittedSteps: 0 };
    const finished: ExecutionWork = {
      steps: [
        marker,
        { ...delegation, status: 'completed', finishedAt: 3_000, subagentStatus: 'completed' },
        nested,
      ],
      omittedSteps: 0,
    };
    const run = [
      snapshot({ revision: 1, cursor: 'cursor:1', work: working }),
      snapshot({
        revision: 2,
        cursor: 'cursor:2',
        assistantText: 'Voici',
        work: finished,
        execution: execution('completed'),
      }),
    ];
    const stream = controlledStream(run);
    mockedStream.mockImplementation(stream.implementation);
    const view = await ready(renderChat());
    act(() => {
      expect(view.result.current.send('Topologie ?')).toBe(true);
    });
    await waitFor(() => expect(mockedStream).toHaveBeenCalled());
    act(() => stream.release(0));
    await waitFor(() => expect(view.result.current.live?.work.steps).toHaveLength(3));
    expect(view.result.current.live?.work.steps).toEqual([marker, delegation, nested]);
    act(() => stream.release(1));
    await waitFor(() => expect(view.result.current.live?.status).toBe('done'));
    expect(view.result.current.live?.assistantText).toBe('Voici');
    expect(view.result.current.live?.work.steps[1]).toEqual({
      ...delegation,
      status: 'completed',
      finishedAt: 3_000,
      subagentStatus: 'completed',
    });
  });

  it.each(['false', 'true'])(
    'uses cumulative public snapshots and hands over with debug=%s',
    async (flag) => {
      vi.stubEnv('VITE_DEBUG_EVENTS', flag);
      const run = [event(1, 'Bon'), event(2, 'Bonjour !'), event(3, 'Bonjour !', 'completed')];
      const stream = controlledStream(run);
      mockedStream.mockImplementation(stream.implementation);
      const view = await ready(renderChat());
      mockedList.mockResolvedValue([stored('Salut', 'user'), stored('Bonjour !', 'assistant')]);
      act(() => {
        expect(view.result.current.send('Salut')).toBe(true);
      });
      await waitFor(() => expect(mockedStream).toHaveBeenCalled());
      act(() => stream.release(0));
      await waitFor(() => expect(view.result.current.live?.assistantText).toBe('Bon'));
      act(() => {
        stream.release(1);
        stream.release(2);
      });
      await waitFor(() => expect(view.result.current.live).toBeNull());
      expect(view.result.current.messages).toHaveLength(2);
      expect(view.result.current.debug.events).toHaveLength(
        flag === 'true' ? synthesizeRun(run).flat().length : 0,
      );
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.anything(),
        CONVERSATION_ID,
        'Salut',
        expect.any(String),
        expect.any(AbortSignal),
      );
      expect(mockedStream).toHaveBeenCalledWith(
        expect.anything(),
        EXECUTION_ID,
        expect.any(AbortSignal),
        'cursor:0',
        CONVERSATION_ID,
      );
    },
  );

  it('accepts terminal lifecycle and title changes at the same native revision', async () => {
    const terminal = event(1, 'Bonjour', 'completed');
    const stream = controlledStream([event(1, 'Bonjour'), terminal]);
    mockedStream.mockImplementation(stream.implementation);
    const view = await ready(renderChat());
    act(() => {
      view.result.current.send('Salut');
      stream.release(0);
    });
    await waitFor(() => expect(view.result.current.live?.assistantText).toBe('Bonjour'));
    mockedList.mockResolvedValue([stored('Salut', 'user'), stored('Bonjour', 'assistant')]);
    act(() => stream.release(1));
    await waitFor(() => expect(view.result.current.live).toBeNull());
    expect(view.result.current.isStreaming).toBe(false);
  });

  it('discovers an active execution after reload without resubmitting the prompt', async () => {
    mockedActive.mockResolvedValue(
      snapshot({ revision: 4, cursor: 'cursor:4', assistantText: 'Déjà reçu' }),
    );
    const stream = controlledStream([event(5, 'Déjà reçu et terminé', 'completed')]);
    mockedStream.mockImplementation(stream.implementation);
    const view = await ready(renderChat());
    await waitFor(() => expect(view.result.current.live?.assistantText).toBe('Déjà reçu'));
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(mockedStream).toHaveBeenCalledWith(
      expect.anything(),
      EXECUTION_ID,
      expect.any(AbortSignal),
      'cursor:4',
      CONVERSATION_ID,
    );
    expect(view.result.current.send('another')).toBe(false);
    mockedActive.mockResolvedValue(null);
    mockedList.mockResolvedValue([
      stored('Salut', 'user'),
      stored('Déjà reçu et terminé', 'assistant'),
    ]);
    act(() => stream.release(0));
    await waitFor(() => expect(view.result.current.live).toBeNull());
  });

  it('rejoins the same execution after EOF from its cursor and ignores an unchanged batch', async () => {
    const next = controlledStream([
      event(1, 'Bon'),
      event(1, 'Bon'),
      event(2, 'Bonjour', 'completed'),
    ]);
    mockedStream
      .mockImplementationOnce(streamOf([event(1, 'Bon')]))
      .mockImplementationOnce(next.implementation);
    const view = await ready(renderChat());
    act(() => {
      view.result.current.send('Salut');
    });
    await waitFor(() => expect(mockedStream).toHaveBeenCalledTimes(2));
    expect(mockedStream.mock.calls[1]?.[3]).toBe('cursor:1');
    expect(mockedCreate).toHaveBeenCalledTimes(1);
    act(() => {
      next.release(0);
      next.release(1);
    });
    await waitFor(() => expect(view.result.current.live?.assistantText).toBe('Bon'));
    mockedList.mockResolvedValue([stored('Salut', 'user'), stored('Bonjour', 'assistant')]);
    act(() => next.release(2));
    await waitFor(() =>
      expect(view.result.current.messages.map((item) => item.content)).toEqual([
        'Salut',
        'Bonjour',
      ]),
    );
  });

  it('retries an ambiguous lost creation response with exactly the same submission id', async () => {
    mockedCreate
      .mockRejectedValueOnce(new TypeError('network lost'))
      .mockResolvedValueOnce(snapshot());
    mockedStream.mockImplementation(controlledStream([event(1)]).implementation);
    const view = await ready(renderChat());
    act(() => {
      view.result.current.send('Salut');
    });
    await waitFor(() => expect(mockedStream).toHaveBeenCalledOnce());
    expect(mockedCreate).toHaveBeenCalledTimes(2);
    expect(mockedCreate.mock.calls[0]?.[3]).toBe(mockedCreate.mock.calls[1]?.[3]);
  });

  it('bounds fruitless reconnect attempts, preserves partial text and never claims a disconnected run completed', async () => {
    mockedStream.mockImplementation(streamOf([event(1, 'Partiel')], new TypeError('offline')));
    const view = await ready(renderChat());
    act(() => {
      view.result.current.send('Salut');
    });
    await waitFor(() => expect(view.result.current.live?.connection).toBe('disconnected'));
    // The first attach delivered the partial answer and re-attached promptly; the six replays
    // that followed brought nothing new and exhausted the budget with backoff in between.
    expect(mockedStream).toHaveBeenCalledTimes(7);
    expect(reattachDelay).toHaveBeenCalledOnce();
    expect(recoveryDelay).toHaveBeenCalledTimes(5);
    expect(view.result.current.live).toMatchObject({
      assistantText: 'Partiel',
      status: 'streaming',
      execution: { status: 'running' },
    });
    expect(view.result.current.send('duplicate')).toBe(false);
    mockedList.mockResolvedValue([stored('Salut', 'user'), stored('Partiel', 'assistant')]);
    act(() => view.result.current.reload());
    await waitFor(() => expect(view.result.current.messages).toEqual([]));
    expect(view.result.current.live?.assistantText).toBe('Partiel');
  });

  it('settles a parked execution with a confirmed native end without reconnecting, and frees the composer', async () => {
    const error = 'The runtime replay is unavailable. Saved output remains readable.';
    const parked = snapshot({
      revision: 1,
      cursor: 'cursor:1',
      assistantText: 'Partiel',
      execution: {
        ...execution('recovery_required', error),
        finishedAt: '2026-09-11T09:01:00.000Z',
      },
    });
    mockedStream.mockImplementation(streamOf([parked]));
    mockedList.mockResolvedValue([stored('Salut', 'user'), stored('Partiel', 'assistant')]);
    const view = await ready(renderChat());
    act(() => {
      view.result.current.send('Salut');
    });
    await waitFor(() => expect(view.result.current.live).toBeNull());
    expect(mockedStream).toHaveBeenCalledOnce();
    expect(mockedGet).not.toHaveBeenCalled();
    expect(recoveryDelay).not.toHaveBeenCalled();
    expect(view.result.current.failure).toMatchObject({ executionId: EXECUTION_ID, error });
    expect(view.result.current.isStreaming).toBe(false);
    expect(view.result.current.messages.at(-1)?.content).toBe('Partiel');
    expect(view.result.current.send('Suite')).toBe(true);
  });

  it('keeps observing a parked execution whose end is not confirmed, without a reconnect storm', async () => {
    // The API holds the stream open with heartbeats for an unsettled parked row; the second
    // gate never opens, so the connection stays up exactly as it does on the server.
    const stream = controlledStream([
      event(1, 'Partiel', 'interrupted'),
      event(2, 'Partiel', 'interrupted'),
    ]);
    mockedStream.mockImplementation(stream.implementation);
    const view = await ready(renderChat());
    act(() => {
      view.result.current.send('Salut');
    });
    await waitFor(() => expect(mockedStream).toHaveBeenCalledOnce());
    stream.release(0);
    await waitFor(() =>
      expect(view.result.current.live).toMatchObject({
        status: 'streaming',
        connection: 'connected',
        execution: { status: 'interrupted' },
      }),
    );
    expect(mockedStream).toHaveBeenCalledOnce();
    expect(recoveryDelay).not.toHaveBeenCalled();
    // Parked work never holds the composer: the next message supersedes it on the API.
    expect(view.result.current.isStreaming).toBe(false);
    expect(view.result.current.send('Suite')).toBe(true);
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(view.result.current.sessions).toHaveLength(2));
  });

  it('does not attach reload discovery to a parked execution whose end is confirmed', async () => {
    mockedActive.mockResolvedValue(
      snapshot({
        execution: { ...execution('recovery_required'), finishedAt: '2026-09-11T09:01:00.000Z' },
      }),
    );
    const view = await ready(renderChat());
    expect(view.result.current.live).toBeNull();
    expect(mockedStream).not.toHaveBeenCalled();
    expect(view.result.current.send('Suite')).toBe(true);
  });

  it('re-attaches from the last cursor when the API asks the observer to reconnect', async () => {
    mockedStream
      .mockImplementationOnce(
        streamOf(
          [event(1, 'Par'), event(2, 'Partiel')],
          new ApiRequestError(503, 'execution_stream_unavailable', 'Indisponible'),
        ),
      )
      .mockImplementationOnce(streamOf([event(3, 'Partiel !', 'completed')]));
    mockedList.mockResolvedValue([stored('Salut', 'user'), stored('Partiel !', 'assistant')]);
    const view = await ready(renderChat());
    act(() => {
      view.result.current.send('Salut');
    });
    await waitFor(() => expect(view.result.current.live).toBeNull());
    expect(mockedStream).toHaveBeenCalledTimes(2);
    expect(mockedStream.mock.calls[1]?.[3]).toBe('cursor:2');
    expect(mockedGet).toHaveBeenCalledOnce();
    expect(view.result.current.messages.at(-1)?.content).toBe('Partiel !');
  });

  it('reconciles a terminal GET after losing the final stream event', async () => {
    mockedStream.mockImplementation(streamOf([event(1, 'Partiel')]));
    mockedGet.mockResolvedValue(
      snapshot({ revision: 2, assistantText: 'Complet', execution: execution('completed') }),
    );
    mockedList.mockResolvedValue([stored('Salut', 'user'), stored('Complet', 'assistant')]);
    const view = await ready(renderChat());
    act(() => {
      view.result.current.send('Salut');
    });
    await waitFor(() => expect(view.result.current.live).toBeNull());
    expect(mockedCreate).toHaveBeenCalledOnce();
    expect(mockedStream).toHaveBeenCalledOnce();
    expect(view.result.current.messages.at(-1)?.content).toBe('Complet');
  });

  it('keeps Stop pending until an authoritative cancellation arrives without closing observation', async () => {
    const stream = controlledStream([event(1, 'Par'), event(3, 'Par', 'cancelled')]);
    mockedStream.mockImplementation(stream.implementation);
    const view = await ready(renderChat());
    act(() => {
      view.result.current.send('Salut');
      stream.release(0);
    });
    await waitFor(() => expect(view.result.current.live?.assistantText).toBe('Par'));
    mockedStop.mockResolvedValue(
      snapshot({ revision: 2, assistantText: 'Par', execution: execution('stopping') }),
    );
    act(() => view.result.current.stop());
    await waitFor(() => expect(mockedStop).toHaveBeenCalledOnce());
    expect(view.result.current.live?.stopPending).toBe(true);
    expect(view.result.current.isStreaming).toBe(true);
    expect(stream.signal()?.aborted).toBe(false);
    render(<ConversationTranscript messages={[]} sessions={view.result.current.sessions} />);
    expect(screen.getByRole('status')).toHaveTextContent('Arrêt demandé');
    mockedList.mockResolvedValue([stored('Salut', 'user'), stored('Par', 'assistant')]);
    act(() => stream.release(1));
    await waitFor(() => expect(view.result.current.live).toBeNull());
    expect(view.result.current.failure).toBeNull();
  });

  it('retries failed Stop requests and still reports pending when their outcome is unknown', async () => {
    mockedStream.mockImplementation(controlledStream([event(4, '', 'cancelled')]).implementation);
    mockedStop.mockRejectedValue(new TypeError('offline'));
    const view = await ready(renderChat());
    act(() => {
      view.result.current.send('Salut');
    });
    await waitFor(() => expect(mockedStream).toHaveBeenCalledOnce());
    act(() => view.result.current.stop());
    await waitFor(() => expect(mockedStop).toHaveBeenCalledTimes(6));
    expect(view.result.current.live?.stopPending).toBe(true);
    expect(view.result.current.isStreaming).toBe(true);
    expect(view.result.current.live?.error).toContain('pas encore confirmé');
  });

  it('unmount and navigation never send the Stop command', async () => {
    const stream = controlledStream([event(1, 'Bon'), event(2, 'Bonjour', 'completed')]);
    mockedStream.mockImplementation(stream.implementation);
    const queryClient = new QueryClient();
    const view = renderHook(({ id }) => useConversationChat(id), {
      initialProps: { id: CONVERSATION_ID },
      wrapper: wrapperWith(queryClient),
    });
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    act(() => {
      view.result.current.send('Salut');
      stream.release(0);
    });
    await waitFor(() => expect(view.result.current.live?.assistantText).toBe('Bon'));
    view.rerender({ id: STANDALONE_CONVERSATION_ID });
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    expect(view.result.current.isStreaming).toBe(false);
    expect(view.result.current.live).toBeNull();
    expect(stream.signal()?.aborted).toBe(false);
    view.rerender({ id: CONVERSATION_ID });
    expect(view.result.current.live?.assistantText).toBe('Bon');
    view.unmount();
    expect(stream.signal()?.aborted).toBe(true);
    expect(mockedStop).not.toHaveBeenCalled();
  });

  it('does not repopulate account caches when a creation response arrives after unmount', async () => {
    let accepted: (snapshot: ExecutionSnapshot) => void = () => undefined;
    mockedCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          accepted = resolve;
        }),
    );
    const view = await ready(renderChat());
    act(() => {
      view.result.current.send('Salut');
    });
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => {
      accepted(snapshot());
      await Promise.resolve();
    });
    expect(
      view.queryClient.getQueryData(['conversations', 'user-1', 'detail', CONVERSATION_ID]),
    ).toBeUndefined();
    expect(mockedStream).not.toHaveBeenCalled();
    expect(mockedStop).not.toHaveBeenCalled();
  });

  it('keeps a completed answer if transcript recovery fails, and reconciles it on later reload', async () => {
    mockedStream.mockImplementation(streamOf([event(1, 'Bonjour', 'completed')]));
    const view = await ready(renderChat());
    mockedList.mockRejectedValue(new Error('history offline'));
    act(() => {
      view.result.current.send('Salut');
    });
    await waitFor(() => expect(view.result.current.live?.status).toBe('done'));
    expect(view.result.current.live?.assistantText).toBe('Bonjour');
    await waitFor(() => expect(view.queryClient.isFetching()).toBe(0));
    mockedList.mockResolvedValue([stored('Salut', 'user'), stored('Bonjour', 'assistant')]);
    act(() => view.result.current.reload());
    await waitFor(() => expect(view.result.current.live).toBeNull());
    expect(view.result.current.messages).toHaveLength(2);
  });

  it('keeps an error marker after handing failed output to stored history', async () => {
    mockedStream.mockImplementation(streamOf([event(1, '', 'failed')]));
    mockedList.mockResolvedValue([stored('Salut', 'user')]);
    const view = await ready(renderChat());
    act(() => {
      view.result.current.send('Salut');
    });
    await waitFor(() =>
      expect(view.result.current.failure).toEqual({
        executionId: EXECUTION_ID,
        error: 'L’agent a échoué.',
      }),
    );
    expect(view.result.current.live).toBeNull();
  });

  it.each(['interrupted', 'recovery_required'] as const)(
    'keeps %s visibly unsettled while releasing the send slot to a superseding message',
    async (status) => {
      mockedCreate.mockResolvedValue(snapshot({ execution: execution(status) }));
      mockedStream.mockImplementation(controlledStream([event(2, '', 'cancelled')]).implementation);
      const view = await ready(renderChat());
      act(() => {
        view.result.current.send('Salut');
      });
      await waitFor(() => expect(view.result.current.live?.execution?.status).toBe(status));
      expect(view.result.current.isStreaming).toBe(false);
      render(<ConversationTranscript messages={[]} sessions={view.result.current.sessions} />);
      expect(screen.getByRole('status')).toHaveTextContent(
        status === 'interrupted' ? 'intervention' : 'vérification',
      );
    },
  );

  it('applies a title carried by the settled state and releases the slot for the next message', async () => {
    const title = { ...snapshot().conversation, title: 'Salutations' };
    const stream = controlledStream([
      event(1, 'FIRST ANSWER'),
      { ...event(1, 'FIRST ANSWER', 'completed'), conversation: title },
    ]);
    mockedStream
      .mockImplementationOnce(stream.implementation)
      .mockImplementationOnce(controlledStream([event(2)]).implementation);
    const view = await ready(renderChat());
    act(() => {
      view.result.current.send('first');
      stream.release(0);
    });
    await waitFor(() => expect(view.result.current.live?.assistantText).toBe('FIRST ANSWER'));
    act(() => stream.release(1));
    await waitFor(() => expect(view.result.current.live?.status).toBe('done'));
    await waitFor(() =>
      expect(
        view.queryClient.getQueryData(['conversations', 'user-1', 'detail', CONVERSATION_ID]),
      ).toMatchObject({ title: 'Salutations' }),
    );
    mockedCreate.mockResolvedValue(
      snapshot({
        execution: { ...execution(), id: '55555555-5555-4555-8555-555555555555' },
        userMessage: 'second',
      }),
    );
    act(() => {
      expect(view.result.current.send('second')).toBe(true);
    });
    await waitFor(() => expect(view.result.current.live?.userMessage).toBe('second'));
    render(<ConversationTranscript messages={[]} sessions={view.result.current.sessions} />);
    expect(screen.getByText('FIRST ANSWER')).toBeVisible();
    expect(view.result.current.sessions).toHaveLength(2);
  });

  it('preserves an earlier identical user row when a new request is rejected before creation', async () => {
    mockedList.mockResolvedValue([stored('repeat', 'user')]);
    mockedCreate.mockRejectedValue(new ApiRequestError(409, 'thread_busy', 'Busy'));
    const view = await ready(renderChat());
    act(() => {
      view.result.current.send('repeat');
    });
    await waitFor(() => expect(view.result.current.live?.status).toBe('error'));
    expect(view.result.current.messages).toEqual([stored('repeat', 'user')]);
    expect(mockedStream).not.toHaveBeenCalled();
  });

  it('fails closed while active execution discovery is unavailable', async () => {
    mockedActive.mockRejectedValue(new TypeError('offline'));
    const view = renderChat();
    await waitFor(() => expect(view.result.current.discoveryFailed).toBe(true));
    expect(view.result.current.send('duplicate')).toBe(false);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('does not revive a completed background execution from stale discovery data on remount', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['active-execution', 'user-1', CONVERSATION_ID], snapshot());
    let resolveActive: (value: null) => void = () => undefined;
    mockedActive.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveActive = resolve;
        }),
    );
    mockedStream.mockImplementation(controlledStream([event(1)]).implementation);
    const view = renderHook(() => useConversationChat(CONVERSATION_ID), {
      wrapper: wrapperWith(queryClient),
    });
    await waitFor(() => expect(mockedActive).toHaveBeenCalledOnce());
    expect(mockedStream).not.toHaveBeenCalled();
    expect(view.result.current.live).toBeNull();
    expect(view.result.current.isDiscovering).toBe(true);
    expect(view.result.current.send('Before discovery')).toBe(false);
    await act(async () => {
      resolveActive(null);
      await Promise.resolve();
    });
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    expect(mockedStream).not.toHaveBeenCalled();
    expect(view.result.current.live).toBeNull();
    act(() => {
      expect(view.result.current.send('After discovery')).toBe(true);
    });
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledOnce());
  });

  it.each(['pending', 'running', 'recovering', 'interrupted', 'recovery_required'] as const)(
    'keeps another chat independent while the first is %s, including Stop and account cleanup',
    async (status) => {
      const secondId = '55555555-5555-4555-8555-555555555555';
      const first = snapshot({ execution: execution(status) });
      const second = snapshot({
        execution: { ...execution(), id: secondId, conversationId: STANDALONE_CONVERSATION_ID },
        conversation: { ...snapshot().conversation, id: STANDALONE_CONVERSATION_ID },
        userMessage: 'Second chat',
      });
      const firstStream = controlledStream([event(1, 'First answer')]);
      const secondStream = controlledStream([
        { ...second, revision: 1, assistantText: 'Second answer' },
      ]);
      mockedCreate.mockImplementation((_client, id) =>
        Promise.resolve(id === CONVERSATION_ID ? first : second),
      );
      mockedStream.mockImplementation((client, id, signal) =>
        (id === EXECUTION_ID ? firstStream : secondStream).implementation(client, id, signal),
      );
      mockedStop.mockResolvedValue({
        ...second,
        execution: { ...second.execution, status: 'stopping' },
      });
      const queryClient = new QueryClient();
      const view = renderHook(({ id }) => useConversationChat(id), {
        initialProps: { id: CONVERSATION_ID },
        wrapper: wrapperWith(queryClient),
      });
      await waitFor(() => expect(view.result.current.status).toBe('ready'));
      act(() => {
        expect(view.result.current.send('First chat')).toBe(true);
        expect(view.result.current.send('duplicate')).toBe(false);
      });
      await waitFor(() => expect(view.result.current.live?.execution?.status).toBe(status));
      view.rerender({ id: STANDALONE_CONVERSATION_ID });
      await waitFor(() => expect(view.result.current.status).toBe('ready'));
      act(() => {
        expect(view.result.current.send('Second chat')).toBe(true);
        expect(view.result.current.send('duplicate')).toBe(false);
      });
      await waitFor(() => expect(mockedStream).toHaveBeenCalledTimes(2));
      expect(firstStream.signal()?.aborted).toBe(false);
      act(() => view.result.current.stop());
      await waitFor(() => expect(mockedStop).toHaveBeenCalledOnce());
      expect(mockedStop.mock.calls[0]?.[1]).toBe(secondId);
      expect(view.result.current.live?.stopPending).toBe(true);
      view.rerender({ id: CONVERSATION_ID });
      expect(view.result.current.live?.execution?.status).toBe(status);
      expect(view.result.current.live?.stopPending).toBe(false);
      expect(view.result.current.sessions).toHaveLength(1);
      vi.mocked(useWorkspaceAccount).mockReturnValue({
        client: { request: vi.fn() },
        userId: 'user-2',
      });
      view.rerender({ id: CONVERSATION_ID });
      await waitFor(() => expect(view.result.current.sessions).toHaveLength(0));
      expect(firstStream.signal()?.aborted).toBe(true);
      expect(secondStream.signal()?.aborted).toBe(true);
      expect(mockedCreate).toHaveBeenCalledTimes(2);
      expect(mockedStop).toHaveBeenCalledOnce();
    },
  );

  it('permits a second conversation while the first creation acknowledgement is pending', async () => {
    const pending = new Promise<ExecutionSnapshot>(() => undefined);
    mockedCreate.mockReturnValue(pending);
    const queryClient = new QueryClient();
    const view = renderHook(({ id }) => useConversationChat(id), {
      initialProps: { id: CONVERSATION_ID },
      wrapper: wrapperWith(queryClient),
    });
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    act(() => {
      expect(view.result.current.send('First')).toBe(true);
    });
    view.rerender({ id: STANDALONE_CONVERSATION_ID });
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    act(() => {
      expect(view.result.current.send('Second')).toBe(true);
    });
    expect(mockedCreate).toHaveBeenCalledTimes(2);
    expect(new Set(mockedCreate.mock.calls.map((call) => call[3])).size).toBe(2);
    view.unmount();
    expect(mockedCreate.mock.calls.every((call) => call[4]?.aborted)).toBe(true);
    expect(mockedStop).not.toHaveBeenCalled();
  });

  it('updates live conversation timestamps without refetching navigation on every snapshot', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const base = snapshot().conversation;
    const stream = controlledStream(
      Array.from({ length: 40 }, (_, index) => {
        const updatedAt = new Date(Date.parse(base.updatedAt) + index * 500).toISOString();
        return snapshot({
          revision: index + 1,
          cursor: `cursor:${index + 1}`,
          assistantText: `Progress ${'.'.repeat(index + 1)}`,
          conversation: { ...base, lastActivityAt: updatedAt, updatedAt },
        });
      }),
    );
    mockedStream.mockImplementation(stream.implementation);
    const view = renderHook(() => useConversationChat(CONVERSATION_ID), {
      wrapper: wrapperWith(queryClient),
    });
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    act(() => {
      view.result.current.send('Salut');
      for (let index = 0; index < 40; index += 1) stream.release(index);
    });
    await waitFor(() =>
      expect(view.result.current.live?.assistantText).toBe(`Progress ${'.'.repeat(40)}`),
    );
    const navigationInvalidations = invalidate.mock.calls.filter(
      ([filters]) => JSON.stringify(filters?.queryKey) === '["conversations","user-1","list"]',
    );
    expect(navigationInvalidations).toHaveLength(1);
    expect(
      queryClient.getQueryData(['conversations', 'user-1', 'detail', CONVERSATION_ID]),
    ).toMatchObject({ updatedAt: new Date(Date.parse(base.updatedAt) + 39 * 500).toISOString() });
  });
});
