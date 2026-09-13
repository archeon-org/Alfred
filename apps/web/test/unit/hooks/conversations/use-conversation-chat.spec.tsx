import type { ExecutionStreamEvent } from '@alfred/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversationTranscript } from '@/components/workspace/conversation/conversation-transcript';
import { ChatSessionProvider } from '@/contexts/chat-session/chat-session-provider';
import { useConversationChat } from '@/hooks/conversations/use-conversation-chat';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { listMessages, streamExecution } from '@/services/executions/executions.service';
import { CONVERSATION_ID, STANDALONE_CONVERSATION_ID } from '../../../support/workspace-api';

vi.mock('@/hooks/workspace/use-workspace-account');
vi.mock('@/services/executions/executions.service');

const mockedAccount = vi.mocked(useWorkspaceAccount);
const mockedList = vi.mocked(listMessages);
const mockedStream = vi.mocked(streamExecution);

const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';

function execution(
  status: 'running' | 'completed' | 'failed' | 'cancelled',
  error: string | null = null,
) {
  return {
    conversationId: CONVERSATION_ID,
    createdAt: '2026-09-11T09:00:00.000Z',
    error,
    finishedAt: null,
    id: EXECUTION_ID,
    startedAt: null,
    status,
  };
}

function stored(content: string, role: 'user' | 'assistant') {
  return {
    content,
    conversationId: CONVERSATION_ID,
    createdAt: '2026-09-11T09:00:00.000Z',
    executionId: EXECUTION_ID,
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
  const view = renderHook(() => useConversationChat(conversationId), {
    wrapper: wrapperWith(queryClient),
  });
  return { ...view, queryClient };
}

function streamOf(events: readonly ExecutionStreamEvent[], failure?: Error) {
  return async function* (_client: unknown, _id: string, _message: string, signal: AbortSignal) {
    for (const event of events) {
      if (signal.aborted) throw new Error('aborted');
      await Promise.resolve();
      yield event;
    }
    if (failure !== undefined) throw failure;
  };
}

/** A stream released one event at a time; an abort rejects it at once, like `fetch` does. */
function controlledStream(events: readonly ExecutionStreamEvent[]) {
  const gates = events.map(() => {
    let open = () => undefined as void;
    const promise = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { open, promise };
  });
  const implementation = async function* (
    _client: unknown,
    _id: string,
    _message: string,
    signal: AbortSignal,
  ) {
    const aborted = new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    for (const [index, event] of events.entries()) {
      await Promise.race([gates[index]?.promise, aborted]);
      yield event;
    }
  };
  return { implementation, release: (index: number) => gates[index]?.open() };
}

describe('useConversationChat with the workspace chat session', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    mockedAccount.mockReturnValue({ client: { request: vi.fn() }, userId: 'user-1' });
    mockedList.mockResolvedValue([]);
  });

  it.each(['false', 'true'])('streams and hands over while debug is %s', async (flag) => {
    vi.stubEnv('VITE_DEBUG_EVENTS', flag);
    const stream = controlledStream([
      { data: execution('running'), event: 'execution' },
      { data: [{ content: 'Bon', id: 'ai-1', type: 'AIMessageChunk' }], event: 'messages/partial' },
      { data: [{ content: 'Bonjour !', id: 'ai-1', type: 'ai' }], event: 'messages/complete' },
      { data: execution('completed'), event: 'execution' },
    ]);
    mockedStream.mockImplementation(stream.implementation);
    const { result } = renderChat();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    mockedList.mockResolvedValue([stored('Salut', 'user'), stored('Bonjour !', 'assistant')]);
    let accepted = false;
    act(() => {
      accepted = result.current.send('Salut');
    });
    expect(accepted).toBe(true);
    await waitFor(() => expect(result.current.isStreaming).toBe(true));
    expect(result.current.live?.userMessage).toBe('Salut');

    act(() => stream.release(0));
    act(() => stream.release(1));
    await waitFor(() => expect(result.current.live?.assistantText).toBe('Bon'));
    expect(result.current.live?.execution?.status).toBe('running');

    act(() => stream.release(2));
    act(() => stream.release(3));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    await waitFor(() => expect(result.current.live).toBeNull());
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.failure).toBeNull();
    expect(result.current.debug.events).toHaveLength(flag === 'true' ? 4 : 0);
    expect(mockedStream).toHaveBeenCalledWith(
      expect.anything(),
      CONVERSATION_ID,
      'Salut',
      expect.any(AbortSignal),
    );
  });

  it('refreshes the conversation cache from provisional and generated title events', async () => {
    const provisional = {
      archivedAt: null,
      createdAt: '2026-09-11T09:00:00.000Z',
      id: CONVERSATION_ID,
      lastActivityAt: '2026-09-11T09:00:01.000Z',
      pinnedAt: null,
      projectId: '44444444-4444-4444-8444-444444444444',
      projectKind: 'implicit' as const,
      title: 'Explique-moi Kafka',
      titleSource: 'auto' as const,
      updatedAt: '2026-09-11T09:00:01.000Z',
    };
    mockedStream.mockImplementation(
      streamOf([
        { data: provisional, event: 'conversation' },
        { data: execution('running'), event: 'execution' },
        { data: { ...provisional, title: 'Kafka : principes et usages' }, event: 'conversation' },
        { data: { nope: true }, event: 'conversation' },
        { data: execution('completed'), event: 'execution' },
      ]),
    );
    mockedList.mockResolvedValue([stored('Explique-moi Kafka', 'user')]);
    const { result, queryClient } = renderChat();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    act(() => {
      result.current.send('Explique-moi Kafka');
    });
    await waitFor(() => expect(result.current.live).toBeNull());

    expect(
      queryClient.getQueryData(['conversations', 'user-1', 'detail', CONVERSATION_ID]),
    ).toEqual({ ...provisional, title: 'Kafka : principes et usages' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversations', 'user-1', 'list'] });
  });

  it('hands a failed turn over to the transcript and keeps its error as a failure marker', async () => {
    mockedStream.mockImplementation(
      streamOf([
        { data: execution('running'), event: 'execution' },
        { data: { message: 'boom' }, event: 'error' },
        { data: execution('failed', 'boom'), event: 'execution' },
      ]),
    );
    mockedList.mockResolvedValue([stored('Salut', 'user')]);
    const { result } = renderChat();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => {
      result.current.send('Salut');
    });
    await waitFor(() =>
      expect(result.current.failure).toEqual({ error: 'boom', executionId: EXECUTION_ID }),
    );
    expect(result.current.live).toBeNull();
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages.map((message) => message.content)).toEqual(['Salut']);
  });

  it('keeps the received answer on screen when the transcript cannot be fetched', async () => {
    mockedStream.mockImplementation(
      streamOf([
        { data: execution('running'), event: 'execution' },
        { data: [{ content: 'Bonjour !', id: 'ai-1', type: 'ai' }], event: 'messages/complete' },
        { data: execution('completed'), event: 'execution' },
      ]),
    );
    const { result } = renderChat();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    mockedList.mockRejectedValue(new Error('Historique indisponible'));
    act(() => {
      result.current.send('Salut');
    });
    await waitFor(() => expect(result.current.live?.status).toBe('done'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.live?.assistantText).toBe('Bonjour !');
    expect(result.current.isStreaming).toBe(false);
  });

  it('marks a stream that closes without a terminal state as interrupted', async () => {
    mockedStream.mockImplementation(
      streamOf([
        { data: execution('running'), event: 'execution' },
        {
          data: [{ content: 'Bon', id: 'ai-1', type: 'AIMessageChunk' }],
          event: 'messages/partial',
        },
      ]),
    );
    const { result } = renderChat();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    mockedList.mockRejectedValue(new Error('Historique indisponible'));
    act(() => {
      result.current.send('Salut');
    });
    await waitFor(() => expect(result.current.live?.status).toBe('error'));
    expect(result.current.live).toMatchObject({
      assistantText: 'Bon',
      error: 'La réponse a été interrompue avant la fin.',
    });
  });

  it('ends the turn on stop and hands the stored partial answer over', async () => {
    const stream = controlledStream([
      { data: execution('running'), event: 'execution' },
      { data: [{ content: 'Par', id: 'ai-1', type: 'AIMessageChunk' }], event: 'messages/partial' },
      { data: [{ content: 'Partiel…', id: 'ai-1', type: 'ai' }], event: 'messages/complete' },
    ]);
    mockedStream.mockImplementation(stream.implementation);
    const { result } = renderChat();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => {
      result.current.send('Salut');
    });
    act(() => stream.release(0));
    act(() => stream.release(1));
    await waitFor(() => expect(result.current.live?.assistantText).toBe('Par'));

    mockedList.mockResolvedValue([stored('Salut', 'user'), stored('Par', 'assistant')]);
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.live).toBeNull());
    expect(result.current.messages.map((message) => message.content)).toEqual(['Salut', 'Par']);
    expect(result.current.failure).toBeNull();
  });

  it('releases the send slot once the execution ended, even while the title still streams', async () => {
    const provisional = {
      archivedAt: null,
      createdAt: '2026-09-11T09:00:00.000Z',
      id: CONVERSATION_ID,
      lastActivityAt: '2026-09-11T09:00:01.000Z',
      pinnedAt: null,
      projectId: '44444444-4444-4444-8444-444444444444',
      projectKind: 'implicit' as const,
      title: 'Salut',
      titleSource: 'auto' as const,
      updatedAt: '2026-09-11T09:00:01.000Z',
    };
    vi.stubEnv('VITE_DEBUG_EVENTS', 'true');
    const first = controlledStream([
      { data: execution('running'), event: 'execution' },
      { data: execution('completed'), event: 'execution' },
      { data: { ...provisional, title: 'Salutations' }, event: 'conversation' },
    ]);
    mockedStream
      .mockImplementationOnce(first.implementation)
      .mockImplementationOnce(streamOf([{ data: execution('completed'), event: 'execution' }]));
    mockedList.mockResolvedValue([stored('Salut', 'user')]);
    const { result, queryClient } = renderChat();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.send('Salut');
    });
    act(() => first.release(0));
    await waitFor(() => expect(result.current.isStreaming).toBe(true));
    expect(result.current.send('Deux')).toBe(false);

    act(() => first.release(1));
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    let second = false;
    act(() => {
      second = result.current.send('Deux');
    });
    expect(second).toBe(true);
    await waitFor(() => expect(result.current.live?.userMessage).toBe('Deux'));

    act(() => first.release(2));
    await waitFor(() =>
      expect(
        queryClient.getQueryData(['conversations', 'user-1', 'detail', CONVERSATION_ID]),
      ).toMatchObject({ title: 'Salutations' }),
    );
    expect(mockedStream).toHaveBeenCalledTimes(2);
  });

  it('reports transport failures and refuses a second send while streaming', async () => {
    mockedStream.mockImplementation(streamOf([], new Error('Réseau indisponible')));
    const { result } = renderChat();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let second: boolean | undefined;
    act(() => {
      result.current.send('Un');
      second = result.current.send('Deux');
    });
    expect(second).toBe(false);
    await waitFor(() =>
      expect(result.current.live).toMatchObject({ error: 'Réseau indisponible', status: 'error' }),
    );
    expect(mockedStream).toHaveBeenCalledTimes(1);
  });

  it('tells another chat that it is busy while an answer streams here', async () => {
    const stream = controlledStream([
      { data: execution('running'), event: 'execution' },
      { data: execution('completed'), event: 'execution' },
    ]);
    mockedStream.mockImplementation(stream.implementation);
    mockedList.mockResolvedValue([stored('Un', 'user')]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => ({
        here: useConversationChat(CONVERSATION_ID),
        other: useConversationChat(STANDALONE_CONVERSATION_ID),
      }),
      { wrapper: wrapperWith(queryClient) },
    );
    await waitFor(() => expect(result.current.other.status).toBe('ready'));

    act(() => {
      result.current.here.send('Un');
    });
    await waitFor(() => expect(result.current.other.busyElsewhere).toBe(true));
    expect(result.current.other.live).toBeNull();
    let refused: boolean | undefined;
    act(() => {
      refused = result.current.other.send('Deux');
    });
    expect(refused).toBe(false);

    act(() => stream.release(0));
    act(() => stream.release(1));
    await waitFor(() => expect(result.current.other.busyElsewhere).toBe(false));
    expect(result.current.here.busyElsewhere).toBe(false);
  });

  it('hides the stored rows of the live turn until the stream has handed over', async () => {
    const stream = controlledStream([
      { data: execution('running'), event: 'execution' },
      { data: [{ content: 'Bonjour !', id: 'ai-1', type: 'ai' }], event: 'messages/complete' },
      { data: execution('completed'), event: 'execution' },
    ]);
    mockedStream.mockImplementation(stream.implementation);
    // Until execution metadata arrives, an identical user row may belong to an earlier turn.
    mockedList.mockResolvedValue([stored('Salut', 'user')]);
    const { result, queryClient } = renderChat();
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    act(() => {
      result.current.send('Salut');
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(true));
    expect(result.current.messages).toEqual([stored('Salut', 'user')]);

    act(() => stream.release(0));
    await waitFor(() => expect(result.current.live?.execution?.status).toBe('running'));
    await queryClient.refetchQueries({ queryKey: ['messages', 'user-1', CONVERSATION_ID] });
    expect(result.current.messages).toEqual([]);

    mockedList.mockResolvedValue([stored('Salut', 'user'), stored('Bonjour !', 'assistant')]);
    act(() => stream.release(1));
    act(() => stream.release(2));
    await waitFor(() => expect(result.current.live).toBeNull());
    expect(result.current.messages.map((message) => message.content)).toEqual([
      'Salut',
      'Bonjour !',
    ]);
  });
  it('retains the first answer when next send starts before title closes', async () => {
    vi.stubEnv('VITE_DEBUG_EVENTS', 'true');
    const first = controlledStream([
      { event: 'execution', data: execution('running') },
      {
        event: 'messages/complete',
        data: [{ id: 'ai-first', type: 'ai', content: 'FIRST ANSWER' }],
      },
      { event: 'execution', data: execution('completed') },
      { event: 'custom', data: { titleDone: true } },
    ]);
    const second = controlledStream([
      {
        event: 'execution',
        data: { ...execution('running'), id: '55555555-5555-4555-8555-555555555555' },
      },
    ]);
    mockedStream
      .mockImplementationOnce(first.implementation)
      .mockImplementationOnce(second.implementation);
    const { result } = renderChat();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => {
      result.current.send('first');
    });
    act(() => {
      first.release(0);
      first.release(1);
      first.release(2);
    });
    await waitFor(() => expect(result.current.live?.status).toBe('done'));
    expect(result.current.live?.assistantText).toBe('FIRST ANSWER');
    act(() => {
      expect(result.current.send('second')).toBe(true);
    });
    await waitFor(() => expect(result.current.live?.userMessage).toBe('second'));
    render(
      <ConversationTranscript
        messages={result.current.messages}
        sessions={result.current.sessions}
      />,
    );
    expect(screen.getByText('FIRST ANSWER')).toBeVisible();
  });
  it('replaces a partial turn after a later successful history reload', async () => {
    mockedStream.mockImplementation(
      streamOf(
        [
          { event: 'execution', data: execution('running') },
          { event: 'messages/partial', data: [{ id: 'ai-first', type: 'ai', content: 'PARTIAL' }] },
        ],
        new Error('synthetic connection failure'),
      ),
    );
    const { result, queryClient } = renderChat();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    mockedList.mockRejectedValue(new Error('history temporarily unavailable'));
    act(() => {
      result.current.send('first');
    });
    await waitFor(() => expect(result.current.status).toBe('error'));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    mockedList.mockResolvedValue([stored('first', 'user'), stored('COMPLETE ANSWER', 'assistant')]);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const visible = [
      ...result.current.messages.map((m) => m.content),
      result.current.live?.assistantText,
    ];
    expect(visible).toContain('COMPLETE ANSWER');
    await waitFor(() => expect(result.current.sessions).toHaveLength(0));
    expect(result.current.failure).toEqual({
      error: 'synthetic connection failure',
      executionId: EXECUTION_ID,
    });
  });

  it('keeps an older local answer before a newer stored answer, then reconciles both once', async () => {
    const secondId = '55555555-5555-4555-8555-555555555555';
    const secondTime = '2026-09-11T09:00:02.000Z';
    const secondRows = [stored('second', 'user'), stored('SECOND ANSWER', 'assistant')].map(
      (message) => ({
        ...message,
        id: `second-${message.id}`,
        executionId: secondId,
        createdAt: secondTime,
      }),
    );
    vi.stubEnv('VITE_DEBUG_EVENTS', 'true');
    const first = controlledStream([
      { event: 'execution', data: execution('running') },
      {
        event: 'messages/complete',
        data: [{ id: 'ai-first', type: 'ai', content: 'FIRST ANSWER' }],
      },
      { event: 'execution', data: execution('completed') },
      { event: 'custom', data: { titleDone: true } },
    ]);
    mockedStream.mockImplementationOnce(first.implementation).mockImplementationOnce(
      streamOf([
        {
          event: 'execution',
          data: { ...execution('running'), id: secondId, createdAt: secondTime },
        },
        {
          event: 'messages/complete',
          data: [{ id: 'ai-second', type: 'ai', content: 'SECOND ANSWER' }],
        },
        {
          event: 'execution',
          data: { ...execution('completed'), id: secondId, createdAt: secondTime },
        },
      ]),
    );
    const { result } = renderChat();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => {
      result.current.send('first');
      first.release(0);
      first.release(1);
      first.release(2);
    });
    await waitFor(() => expect(result.current.live?.status).toBe('done'));
    mockedList.mockResolvedValue(secondRows);
    act(() => {
      expect(result.current.send('second')).toBe(true);
    });
    await waitFor(() => expect(result.current.messages).toEqual(secondRows));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));
    const view = render(
      <ConversationTranscript
        messages={result.current.messages}
        sessions={result.current.sessions}
      />,
    );
    expect(screen.getByText('FIRST ANSWER')).toBeVisible();
    expect(
      screen.getByText('FIRST ANSWER').compareDocumentPosition(screen.getByText('SECOND ANSWER')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    mockedList.mockResolvedValue([
      stored('first', 'user'),
      stored('FIRST ANSWER', 'assistant'),
      ...secondRows,
    ]);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.sessions).toHaveLength(0));
    act(() => first.release(3));
    view.rerender(
      <ConversationTranscript
        messages={result.current.messages}
        sessions={result.current.sessions}
      />,
    );
    expect(screen.getAllByText('FIRST ANSWER')).toHaveLength(1);
    expect(screen.getAllByText('SECOND ANSWER')).toHaveLength(1);
  });

  it('retains a completed answer in its conversation while sending in another conversation', async () => {
    vi.stubEnv('VITE_DEBUG_EVENTS', 'true');
    const first = controlledStream([
      { event: 'execution', data: execution('running') },
      {
        event: 'messages/complete',
        data: [{ id: 'ai-first', type: 'ai', content: 'FIRST ANSWER' }],
      },
      { event: 'execution', data: execution('completed') },
      { event: 'custom', data: { titleDone: true } },
    ]);
    const second = controlledStream([{ event: 'custom', data: {} }]);
    mockedStream
      .mockImplementationOnce(first.implementation)
      .mockImplementationOnce(second.implementation);
    const { result } = renderHook(
      () => ({
        here: useConversationChat(CONVERSATION_ID),
        other: useConversationChat(STANDALONE_CONVERSATION_ID),
      }),
      { wrapper: wrapperWith(new QueryClient({ defaultOptions: { queries: { retry: false } } })) },
    );
    await waitFor(() => expect(result.current.here.status).toBe('ready'));
    act(() => {
      result.current.here.send('first');
      first.release(0);
      first.release(1);
      first.release(2);
    });
    await waitFor(() => expect(result.current.here.live?.status).toBe('done'));
    act(() => {
      expect(result.current.other.send('second')).toBe(true);
    });
    await waitFor(() => expect(result.current.other.isStreaming).toBe(true));
    expect(result.current.here.live?.assistantText).toBe('FIRST ANSWER');
    expect(result.current.here.busyElsewhere).toBe(true);
    expect(result.current.other.sessions).toHaveLength(1);
    // The first stream closing cannot retire or mutate the second run.
    act(() => first.release(3));
    await waitFor(() => expect(result.current.here.debug.events.at(-1)?.event).toBe('custom'));
    expect(result.current.other.live?.userMessage).toBe('second');
    expect(result.current.other.isStreaming).toBe(true);
  });

  it('preserves a previous user row when the same prompt fails before an execution id arrives', async () => {
    const previous = stored('repeat', 'user');
    mockedList.mockResolvedValue([previous]);
    mockedStream.mockImplementation(streamOf([], new Error('Connection unavailable')));
    const { result } = renderChat();
    await waitFor(() => expect(result.current.messages).toEqual([previous]));
    act(() => {
      result.current.send('repeat');
    });
    await waitFor(() => expect(result.current.live?.status).toBe('error'));
    expect(result.current.messages).toEqual([previous]);

    const later = { ...previous, id: 'later-message', executionId: 'later-execution' };
    mockedList.mockResolvedValue([previous, later]);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.messages).toEqual([previous, later]));
  });
});
