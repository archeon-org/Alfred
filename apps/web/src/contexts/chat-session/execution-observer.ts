import {
  applyExecutionDelta,
  type Conversation,
  type Execution,
  type ExecutionSnapshot,
} from '@alfred/contracts';

import type { LiveTurn } from '@/contexts/chat-session/chat-session-context';
import { handOver, type HandoverContext } from '@/contexts/chat-session/transcript-handover';
import { conversationKeys } from '@/hooks/workspace/workspace-keys';
import { describeApiError } from '@/lib/workspace/api-error-message';
import { captureRuntimeEvent } from '@/lib/workspace/runtime-event-debug';
import {
  createExecution,
  getExecution,
  observeExecution,
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

export function isBusyExecution(execution: Execution | null): boolean {
  return execution === null || BUSY.has(execution.status);
}

/**
 * Terminal, or parked with a confirmed native end (`finishedAt` set on `recovery_required`). The
 * API sends such a snapshot once and closes; there is nothing left to observe or reconnect to.
 */
export function isSettledExecution(execution: Execution): boolean {
  return TERMINAL.has(execution.status) || execution.finishedAt !== null;
}

const DISCONNECTED =
  'Connexion interrompue. L’exécution peut continuer. Reconnectez-vous pour vérifier son état.';

/** A delta that does not continue the held snapshot: reconnecting fetches a full snapshot. */
class DeltaGapError extends Error {
  constructor() {
    super('Delta frame does not continue the last accepted snapshot');
    this.name = 'DeltaGapError';
  }
}

/** Owns observation only; server execution lifetime never depends on this browser controller. */
export function createExecutionObserver(options: ObserverOptions) {
  const { client, conversationId, controller, dispatch, id, text, userId } = options;
  const submissionId = crypto.randomUUID();
  let cursor: string | null = null;
  let revision = -1;
  let lastSnapshot: ExecutionSnapshot | null = null;
  let isObserving = false;
  let isStopping = false;
  let diagnosticSequence = 0;
  let previousConversation: Conversation | null = null;
  let handover: Promise<void> | undefined;
  let turn: LiveTurn = {
    assistantText: '',
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
    // completion, but do not turn every streamed snapshot into another navigation HTTP request.
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
  const accept = (snapshot: ExecutionSnapshot) => {
    if (controller.signal.aborted) return;
    if (
      snapshot.execution.conversationId !== conversationId ||
      (turn.execution !== null && snapshot.execution.id !== turn.execution.id)
    )
      throw new InvalidStreamError();
    if (snapshot.revision < revision) return;
    if (snapshot.revision === revision && snapshot.assistantText !== turn.assistantText)
      throw new InvalidStreamError();
    // The HTTP stop response can race an older snapshot already in the SSE queue.
    if (turn.status !== 'streaming' && !isSettledExecution(snapshot.execution)) return;
    if (
      snapshot.revision === revision &&
      turn.execution?.status === 'stopping' &&
      !isSettledExecution(snapshot.execution) &&
      snapshot.execution.status !== 'stopping'
    )
      return;
    revision = snapshot.revision;
    cursor = snapshot.cursor;
    lastSnapshot = snapshot;
    title(snapshot.conversation);
    const execution = snapshot.execution;
    const settled = isSettledExecution(execution);
    // A parked execution whose end is confirmed keeps its saved text and reads as a failed turn.
    const failed =
      execution.status === 'failed' ||
      execution.status === 'timed_out' ||
      (settled && execution.status !== 'completed' && execution.status !== 'cancelled');
    publish({
      ...turn,
      assistantText: snapshot.assistantText,
      execution,
      userMessage: snapshot.userMessage,
      error: failed ? (execution.error ?? 'L’agent a échoué.') : null,
      status: failed ? 'error' : settled ? 'done' : 'streaming',
      connection: 'connected',
      stopPending: !settled && (turn.stopPending === true || execution.status === 'stopping'),
    });
    if (settled) handover ??= handOver(options, turn);
  };
  dispatch({
    type: 'start',
    session: {
      conversationId,
      id,
      turn,
      createdAt: options.snapshot?.execution.createdAt ?? new Date().toISOString(),
    },
  });
  if (options.snapshot !== undefined) accept(options.snapshot);

  const create = async () => {
    for (let attempt = 0; attempt < RECOVERY_ATTEMPTS; attempt += 1) {
      try {
        accept(
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
        if (attempt > 0) accept(await getExecution(client, executionId, controller.signal));
        if (turn.status !== 'streaming') return;
        for await (const event of observeExecution(
          client,
          executionId,
          controller.signal,
          cursor,
        )) {
          if (controller.signal.aborted) return;
          let captured: typeof event = event;
          if (event.event === 'snapshot') accept(event.data);
          else if (event.event === 'delta') {
            // Deltas only extend the frame this observer already holds; any gap reconnects.
            const merged =
              lastSnapshot === null ? null : applyExecutionDelta(lastSnapshot, event.data);
            if (merged === null) throw new DeltaGapError();
            accept(merged);
            captured = {
              event: 'snapshot',
              data: merged,
              ...(event.id === undefined ? {} : { id: event.id }),
            };
          } else title(event.data);
          // Services accept only the validated public profile; native runtime payloads never enter diagnostics.
          captureRuntimeEvent(userId, conversationId, { ...captured, id: diagnosticSequence++ });
          // Replay can deliver hundreds of frames in one network chunk. Let React render and
          // process input between bounded batches instead of exhausting its update depth.
          if (diagnosticSequence % 24 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (turn.status !== 'streaming') return;
        throw new Error('Observer closed before a terminal snapshot');
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
          accept(await stopExecution(client, executionId, controller.signal));
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
