import type {
  AlfredRunState,
  Conversation,
  Execution,
  ExecutionSnapshot,
  ExecutionStatus,
} from '@alfred/contracts';

import { createAgUiSubscriber } from '@/contexts/chat-session/ag-ui-subscriber';
import type { LiveTurn } from '@/contexts/chat-session/chat-session-context';
import { LiveAnswer } from '@/contexts/chat-session/live-answer';
import { handOver, type HandoverContext } from '@/contexts/chat-session/transcript-handover';
import { conversationKeys } from '@/hooks/workspace/workspace-keys';
import { describeApiError } from '@/lib/workspace/api-error-message';
import { captureRuntimeEvent } from '@/lib/workspace/runtime-event-debug';
import type { AlfredExecutionAgent } from '@/services/executions/ag-ui-agent';
import {
  createExecution,
  getExecution,
  stopExecution,
} from '@/services/executions/executions.service';
import { isRetryable, RECOVERY_ATTEMPTS, recoveryDelay } from '@/services/executions/recovery';
import { ApiRequestError } from '@/services/http/api-json';
import { InvalidStreamError } from '@/services/executions/sse';

interface ObserverOptions extends HandoverContext {
  readonly id: number;
  readonly text: string;
  readonly snapshot?: ExecutionSnapshot;
  readonly onClose: () => void;
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'timed_out']);
/** Only advancing work blocks the composer; a parked answer is superseded by the next message. */
const BUSY = new Set(['pending', 'running', 'stopping']);
/**
 * Product statuses only move forward. A frame carrying an earlier stage (a queued `running`
 * after the Stop acknowledgement said `stopping`) is a stale delivery, never a regression.
 */
const STATUS_RANK: Readonly<Record<ExecutionStatus, number>> = {
  pending: 0,
  running: 1,
  recovering: 1,
  interrupted: 2,
  recovery_required: 2,
  stopping: 3,
  completed: 4,
  failed: 4,
  cancelled: 4,
  timed_out: 4,
};
/** Let React render and process input between bounded batches of AG-UI events. */
const EVENT_BATCH = 24;

export function isBusyExecution(execution: Execution | null): boolean {
  return execution === null || BUSY.has(execution.status);
}

/**
 * Terminal, or parked with a confirmed native end (`finishedAt` set on `recovery_required`). The
 * API sends such a run once and closes; there is nothing left to observe or reconnect to.
 */
export function isSettledExecution(execution: Execution): boolean {
  return TERMINAL.has(execution.status) || execution.finishedAt !== null;
}

const DISCONNECTED =
  'Connexion interrompue. L’exécution peut continuer. Reconnectez-vous pour vérifier son état.';

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error('Observation transport failed');

/** Owns observation only; server execution lifetime never depends on this browser controller. */
export function createExecutionObserver(options: ObserverOptions) {
  const { client, conversationId, controller, dispatch, id, text, userId } = options;
  const submissionId = crypto.randomUUID();
  let cursor: string | null = null;
  /** Revision of the last accepted JSON snapshot; AG-UI frames carry no revision. */
  let jsonRevision = -1;
  const answer = new LiveAnswer();
  /** Settled state announced by the stream; the turn settles on the AG-UI lifecycle end. */
  let settledState: Execution | null = null;
  let isObserving = false;
  let isStopping = false;
  let diagnosticSequence = 0;
  let previousConversation: Conversation | null = null;
  let handover: Promise<void> | undefined;
  let turn: LiveTurn = {
    assistantText: '',
    activities: [],
    error: null,
    events: [],
    execution: null,
    status: 'streaming',
    userMessage: text,
    connection: 'connecting',
    stopPending: false,
  };
  const publish = (next: LiveTurn) => {
    if (controller.signal.aborted) return;
    turn = next;
    dispatch({ type: 'update', id, turn });
  };
  const title = (conversation: Conversation) => {
    if (controller.signal.aborted) return;
    if (conversation.id !== conversationId) throw new InvalidStreamError();
    if (JSON.stringify(previousConversation) === JSON.stringify(conversation)) return;
    const previous = previousConversation;
    previousConversation = conversation;
    const cached = options.queryClient.getQueryData<Conversation>(
      conversationKeys.detail(userId, conversation.id),
    );
    if (cached && cached.updatedAt > conversation.updatedAt) return;
    options.queryClient.setQueryData(
      conversationKeys.detail(userId, conversation.id),
      conversation,
    );
    // Activity timestamps advance with token projection. Refresh list ordering on attachment and
    // completion, but do not turn every streamed frame into another navigation HTTP request.
    if (
      previous === null ||
      previous.title !== conversation.title ||
      previous.titleSource !== conversation.titleSource ||
      previous.projectId !== conversation.projectId ||
      previous.projectKind !== conversation.projectKind ||
      previous.pinnedAt !== conversation.pinnedAt ||
      previous.archivedAt !== conversation.archivedAt
    )
      void options.queryClient.invalidateQueries({ queryKey: conversationKeys.lists(userId) });
  };
  const assertIdentity = (execution: Execution) => {
    if (
      execution.conversationId !== conversationId ||
      (turn.execution !== null && execution.id !== turn.execution.id)
    )
      throw new InvalidStreamError();
  };
  /** False when the product state must not move the turn: settled turn, stale stage delivery. */
  const admits = (execution: Execution) => {
    if (turn.status !== 'streaming' && !isSettledExecution(execution)) return false;
    return (
      turn.execution === null || STATUS_RANK[execution.status] >= STATUS_RANK[turn.execution.status]
    );
  };
  const commit = (execution: Execution, patch: Partial<LiveTurn>) => {
    const settled = isSettledExecution(execution);
    // A parked execution whose end is confirmed keeps its saved text and reads as a failed turn.
    const failed =
      execution.status === 'failed' ||
      execution.status === 'timed_out' ||
      (settled && execution.status !== 'completed' && execution.status !== 'cancelled');
    publish({
      ...turn,
      ...patch,
      execution,
      error: failed ? (execution.error ?? 'L’agent a échoué.') : null,
      status: failed ? 'error' : settled ? 'done' : 'streaming',
      connection: 'connected',
      stopPending: !settled && (turn.stopPending === true || execution.status === 'stopping'),
    });
    if (settled) handover ??= handOver(options, turn);
  };
  /** JSON commands (create, read, Stop, discovery) carry the cumulative public projection. */
  const acceptSnapshot = (snapshot: ExecutionSnapshot) => {
    if (controller.signal.aborted) return;
    assertIdentity(snapshot.execution);
    if (snapshot.revision < jsonRevision) return;
    if (
      !answer.streamed &&
      snapshot.revision === jsonRevision &&
      !answer.extends(snapshot.assistantText)
    )
      throw new InvalidStreamError();
    if (!admits(snapshot.execution)) return;
    const taken = answer.read(snapshot, isSettledExecution(snapshot.execution));
    jsonRevision = snapshot.revision;
    title(snapshot.conversation);
    if (taken) cursor = snapshot.cursor;
    commit(
      snapshot.execution,
      taken
        ? {
            assistantText: answer.text,
            activities: answer.activities,
            userMessage: snapshot.userMessage,
          }
        : {},
    );
  };
  /**
   * AG-UI state carries the product DTOs; the answer and tools follow as message/tool events, so
   * a settled state is remembered and applied when RUN_FINISHED or RUN_ERROR closes the run.
   */
  const acceptState = (state: AlfredRunState) => {
    assertIdentity(state.execution);
    title(state.conversation);
    if (!admits(state.execution)) return;
    if (isSettledExecution(state.execution)) {
      settledState = state.execution;
      if (turn.status === 'streaming')
        publish({ ...turn, execution: state.execution, userMessage: state.userMessage });
      return;
    }
    commit(state.execution, { userMessage: state.userMessage });
  };
  const finishRun = (fallback: () => void) => {
    if (turn.status !== 'streaming') return;
    if (settledState !== null)
      commit(settledState, { assistantText: answer.text, activities: answer.activities });
    else fallback();
  };
  const live = (patch: Partial<LiveTurn>) => {
    if (turn.status === 'streaming') publish({ ...turn, ...patch, connection: 'connected' });
  };
  const handlers = (agent: AlfredExecutionAgent) => ({
    runStarted: (threadId: string) => {
      if (threadId !== conversationId) throw new InvalidStreamError();
      answer.reset();
      settledState = null;
    },
    state: acceptState,
    messageStart: (messageId: string) => {
      // A later message replaces the visible answer; the first one keeps the last known text
      // on screen until its content arrives.
      if (answer.start(messageId)) live({ assistantText: '' });
    },
    messageDelta: (messageId: string, delta: string) => {
      if (!answer.append(messageId, delta)) throw new InvalidStreamError();
      live({ assistantText: answer.text });
    },
    toolStart: (toolCallId: string, toolCallName: string) => {
      if (answer.toolStart(toolCallId, toolCallName)) live({ activities: answer.activities });
    },
    toolResult: (toolCallId: string, content: string) => {
      answer.toolResult(toolCallId, content);
      live({ activities: answer.activities });
    },
    runFinished: () => finishRun(() => undefined),
    // The settled state normally precedes this; without it the run still ends as an error.
    runError: (message: string) =>
      finishRun(() =>
        publish({ ...turn, status: 'error', error: message, connection: 'connected' }),
      ),
    event: async (event: { readonly type: string }) => {
      cursor = agent.cursor;
      // Services accept only the validated public profile; native runtime payloads never enter diagnostics.
      captureRuntimeEvent(userId, conversationId, {
        id: ++diagnosticSequence,
        event: event.type,
        data: event,
      });
      if (diagnosticSequence % EVENT_BATCH === 0)
        await new Promise((resolve) => setTimeout(resolve, 0));
    },
  });
  dispatch({
    type: 'start',
    session: {
      conversationId,
      id,
      turn,
      createdAt: options.snapshot?.execution.createdAt ?? new Date().toISOString(),
    },
  });
  if (options.snapshot !== undefined) acceptSnapshot(options.snapshot);

  const create = async () => {
    for (let attempt = 0; attempt < RECOVERY_ATTEMPTS; attempt += 1) {
      try {
        acceptSnapshot(
          await createExecution(client, conversationId, text, submissionId, controller.signal),
        );
        if (turn.stopPending) stop();
        return true;
      } catch (error) {
        if (controller.signal.aborted) return false;
        if (error instanceof ApiRequestError && !isRetryable(error)) {
          publish({
            ...turn,
            status: 'error',
            connection: 'disconnected',
            error: describeApiError(error, 'L’envoi du message a échoué.'),
          });
          return false;
        }
        publish({ ...turn, connection: 'recovering' });
        if (attempt < RECOVERY_ATTEMPTS - 1) await recoveryDelay(attempt, controller.signal);
      }
    }
    // Creation might have committed. Retain the same submission id for an explicit retry.
    publish({ ...turn, connection: 'disconnected', error: DISCONNECTED });
    return false;
  };

  const observe = async () => {
    const executionId = turn.execution?.id;
    if (executionId === undefined) return;
    for (let attempt = 0; attempt < RECOVERY_ATTEMPTS; attempt += 1) {
      try {
        if (attempt > 0) acceptSnapshot(await getExecution(client, executionId, controller.signal));
        if (turn.status !== 'streaming') return;
        // The AG-UI client and its dependencies load on demand, outside the initial bundle.
        const { AlfredExecutionAgent } = await import('@/services/executions/ag-ui-agent');
        // Detachment or a settled turn while the module loaded must not open an observation.
        if (controller.signal.aborted || turn.status !== 'streaming') return;
        const agent = new AlfredExecutionAgent({
          client,
          conversationId,
          cursor,
          executionId,
          signal: controller.signal,
        });
        const subscriber = createAgUiSubscriber(agent, handlers(agent), controller.signal);
        await agent.runAgent({ runId: executionId }, subscriber);
        cursor = agent.cursor;
        const failure = subscriber.invalid() ?? agent.failure;
        if (failure !== null) throw toError(failure);
        if (controller.signal.aborted || turn.status !== 'streaming') return;
        throw new Error('Observer closed before a terminal run');
      } catch (error) {
        if (controller.signal.aborted || turn.status !== 'streaming') return;
        if (!isRetryable(error) || attempt === RECOVERY_ATTEMPTS - 1) {
          publish({ ...turn, connection: 'disconnected', error: DISCONNECTED });
          return;
        }
        publish({ ...turn, connection: 'recovering', error: null });
        await recoveryDelay(attempt, controller.signal);
      }
    }
  };

  const start = () => {
    if (isObserving || controller.signal.aborted) return;
    isObserving = true;
    publish({ ...turn, connection: 'connecting', error: null });
    void (async () => {
      if (turn.execution === null && !(await create())) return;
      await observe();
    })()
      .catch(() => {
        if (!controller.signal.aborted && turn.status === 'streaming') {
          publish({ ...turn, connection: 'disconnected', error: DISCONNECTED });
        }
      })
      .finally(async () => {
        isObserving = false;
        // Keep this controller available to logout while the stored transcript is reconciling.
        if (turn.status !== 'streaming') {
          await handover;
          options.onClose();
        }
      });
  };

  const stop = () => {
    if (isStopping || controller.signal.aborted || turn.status !== 'streaming') return;
    const executionId = turn.execution?.id;
    if (executionId === undefined) {
      publish({ ...turn, stopPending: true });
      start();
      return;
    }
    isStopping = true;
    publish({ ...turn, stopPending: true, error: null });
    void (async () => {
      for (let attempt = 0; attempt < RECOVERY_ATTEMPTS; attempt += 1) {
        try {
          acceptSnapshot(await stopExecution(client, executionId, controller.signal));
          start();
          return;
        } catch (error) {
          if (controller.signal.aborted) return;
          if (!isRetryable(error) || attempt === RECOVERY_ATTEMPTS - 1) break;
          await recoveryDelay(attempt, controller.signal);
        }
      }
      publish({ ...turn, error: 'L’arrêt n’est pas encore confirmé. Vous pouvez réessayer.' });
    })()
      .catch(() => {
        if (!controller.signal.aborted)
          publish({ ...turn, error: 'L’arrêt n’est pas encore confirmé. Vous pouvez réessayer.' });
      })
      .finally(() => {
        isStopping = false;
      });
  };

  return {
    conversationId,
    controller,
    executionId: () => turn.execution?.id,
    isActive: () => turn.status === 'streaming',
    /** True while the answer is genuinely advancing; parked work lets the user write again. */
    blocksComposer: () => turn.status === 'streaming' && isBusyExecution(turn.execution),
    start,
    stop,
  };
}
