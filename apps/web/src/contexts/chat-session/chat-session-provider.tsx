import {
  CONVERSATION_SSE_EVENT,
  conversationSchema,
  createAssistantReply,
  EXECUTION_SSE_EVENT,
  executionSchema,
  type ExecutionStreamEvent,
  type Message,
} from '@alfred/contracts';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';

import {
  ChatSessionContext,
  type ChatSessionContextValue,
  type LiveTurn,
  type RuntimeEventView,
} from '@/contexts/chat-session/chat-session-context';
import {
  chatSessionReducer,
  transcriptHoldsTurn,
  type ChatSessionAction,
} from '@/contexts/chat-session/chat-session-state';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { conversationKeys, messageKeys } from '@/hooks/workspace/workspace-keys';
import { describeApiError } from '@/lib/workspace/api-error-message';
import { listMessages, streamExecution } from '@/services/executions/executions.service';
import type { HttpClient } from '@/services/http/http-client';

const EVENT_LOG_LIMIT = 200;
/** After a stop, the API stores the partial answer while the browser already refetches. */
const HANDOVER_ATTEMPTS = 3;
const HANDOVER_RETRY_MS = 500;
const INTERRUPTED = 'La réponse a été interrompue avant la fin.';

export function ChatSessionProvider({ children }: { readonly children: ReactNode }) {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  const [{ sessions, failures }, dispatch] = useReducer(chatSessionReducer, {
    sessions: [],
    failures: new Map(),
  });
  const live = sessions.at(-1) ?? null;
  const reconcile = useCallback((conversationId: string, messages: readonly Message[]) => {
    dispatch({ type: 'reconcile', conversationId, messages });
  }, []);
  // The answer being produced: refuses other sends until its execution reaches a terminal state.
  const inFlightRef = useRef<AbortController | null>(null);
  // Every stream still open, including one only waiting for the generated title.
  const openRef = useRef(new Set<AbortController>());
  const sequenceRef = useRef(0);

  useEffect(
    () => () => {
      for (const controller of openRef.current) controller.abort();
    },
    [],
  );

  // An in-flight stream keeps the client it started with; a refreshed token only affects later sends.
  const send = useCallback(
    (conversationId: string, text: string): boolean => {
      if (inFlightRef.current !== null) return false;
      const controller = new AbortController();
      inFlightRef.current = controller;
      openRef.current.add(controller);
      const release = () => {
        if (inFlightRef.current === controller) inFlightRef.current = null;
      };
      void runExecution({
        client,
        controller,
        conversationId,
        id: sequenceRef.current++,
        queryClient,
        release,
        dispatch,
        text,
        userId,
      }).finally(() => {
        release();
        openRef.current.delete(controller);
      });
      return true;
    },
    [client, queryClient, userId],
  );

  const stop = useCallback(() => inFlightRef.current?.abort(), []);

  const value = useMemo<ChatSessionContextValue>(
    () => ({ failures, live, sessions, reconcile, send, stop }),
    [failures, live, sessions, reconcile, send, stop],
  );
  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>;
}

interface ExecutionRun {
  readonly client: HttpClient;
  readonly controller: AbortController;
  readonly conversationId: string;
  readonly id: number;
  readonly queryClient: QueryClient;
  /** Lets the next send start; called once the execution reached a terminal state. */
  readonly release: () => void;
  readonly dispatch: Dispatch<ChatSessionAction>;
  readonly text: string;
  readonly userId: string;
}

/** Streams one execution, keeps the caches fresh and hands over to the stored transcript. */
async function runExecution(run: ExecutionRun): Promise<void> {
  const { client, controller, conversationId, id, queryClient, release, dispatch, text, userId } =
    run;
  const reply = createAssistantReply();
  let sequence = 0;
  let turn: LiveTurn = {
    assistantText: '',
    error: null,
    events: [],
    execution: null,
    status: 'streaming',
    userMessage: text,
  };
  const update = (change: (current: LiveTurn) => LiveTurn) => {
    turn = change(turn);
    dispatch({ type: 'update', id, turn });
  };
  dispatch({
    type: 'start',
    session: { conversationId, id, turn, createdAt: new Date().toISOString() },
  });
  let handover: Promise<void> | undefined;
  try {
    for await (const event of streamExecution(client, conversationId, text, controller.signal)) {
      reply.observe(event.event, event.data);
      if (event.event === CONVERSATION_SSE_EVENT) {
        // Provisional then agent-generated title: refresh the header and the sidebar lists.
        const parsed = conversationSchema.safeParse(event.data);
        if (parsed.success) {
          queryClient.setQueryData(conversationKeys.detail(userId, parsed.data.id), parsed.data);
          void queryClient.invalidateQueries({ queryKey: conversationKeys.lists(userId) });
        }
      }
      const view = { data: event.data, event: event.event, id: sequence++ };
      update((current) => applyEvent(current, event, view, reply.text));
      // The answer is settled; the stream may stay open for the generated title only.
      if (turn.status !== 'streaming') {
        release();
        handover ??= handOver(run, turn);
      }
    }
    update((current) =>
      current.status === 'streaming'
        ? { ...current, error: INTERRUPTED, status: 'error' }
        : current,
    );
  } catch (error) {
    const aborted = controller.signal.aborted;
    update((current) =>
      current.status !== 'streaming'
        ? current
        : {
            ...current,
            error: aborted ? null : describeApiError(error, 'L’envoi du message a échoué.'),
            status: aborted ? 'done' : 'error',
          },
    );
  } finally {
    release();
    await (handover ?? handOver(run, turn));
  }
}

function applyEvent(
  turn: LiveTurn,
  event: ExecutionStreamEvent,
  view: RuntimeEventView,
  assistantText: string,
): LiveTurn {
  const events =
    turn.events.length >= EVENT_LOG_LIMIT
      ? [...turn.events.slice(1), view]
      : [...turn.events, view];
  if (event.event !== EXECUTION_SSE_EVENT) return { ...turn, assistantText, events };
  const parsed = executionSchema.safeParse(event.data);
  if (!parsed.success) return { ...turn, assistantText, events };
  const execution = parsed.data;
  const failed = execution.status === 'failed';
  const settled = failed || execution.status === 'completed' || execution.status === 'cancelled';
  return {
    ...turn,
    assistantText,
    error: failed ? (execution.error ?? 'L’agent a échoué.') : turn.error,
    events,
    execution,
    status: failed ? 'error' : settled ? 'done' : turn.status,
  };
}

/**
 * Clears the live turn once the stored transcript holds its rows; until then the live copy is the
 * only one and stays on screen. A failed turn leaves its error under the stored rows.
 */
async function handOver(run: ExecutionRun, turn: LiveTurn): Promise<void> {
  const { conversationId, queryClient, dispatch, userId } = run;
  await queryClient.invalidateQueries({ queryKey: conversationKeys.all(userId) });
  if (turn.execution === null) return;
  const messages = await fetchTranscript(run, turn);
  if (messages !== null) dispatch({ type: 'reconcile', conversationId, messages });
}

async function fetchTranscript(
  { client, conversationId, queryClient, userId }: ExecutionRun,
  turn: LiveTurn,
): Promise<readonly Message[] | null> {
  for (let attempt = 0; attempt < HANDOVER_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, HANDOVER_RETRY_MS));
    try {
      const messages = await queryClient.fetchQuery({
        queryFn: () => listMessages(client, conversationId),
        queryKey: messageKeys.list(userId, conversationId),
        staleTime: 0,
      });
      if (transcriptHoldsTurn(messages, turn)) return messages;
    } catch {
      return null;
    }
  }
  return null;
}
