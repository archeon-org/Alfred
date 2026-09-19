import type { AlfredRunState, Conversation, Execution, ExecutionSnapshot } from '@alfred/contracts';

import { createAgUiSubscriber } from '@/contexts/chat-session/ag-ui-subscriber';
import { AttachProgress } from '@/contexts/chat-session/attach-progress';
import type { LiveTurn } from '@/contexts/chat-session/chat-session-context';
import { createConversationCache } from '@/contexts/chat-session/conversation-cache';
import {
  advances,
  failedExecution,
  isBusyExecution,
  isSettledExecution,
} from '@/contexts/chat-session/execution-status';
import { LiveAnswer } from '@/contexts/chat-session/live-answer';
import { EMPTY_WORK, LiveWork } from '@/contexts/chat-session/live-work';
import { createLiveHandlers } from '@/contexts/chat-session/observer-handlers';
import { handOver, type HandoverContext } from '@/contexts/chat-session/transcript-handover';
import { createTurnPublisher } from '@/contexts/chat-session/turn-publisher';
import { describeApiError } from '@/lib/workspace/api-error-message';
import { reportRuntimeEventFault } from '@/lib/workspace/runtime-event-debug';
import type { AlfredExecutionAgent } from '@/services/executions/ag-ui-agent';
import {
  createExecution,
  getExecution,
  stopExecution,
} from '@/services/executions/executions.service';
import {
  isRetryable,
  reattachDelay,
  RECOVERY_ATTEMPTS,
  RecoveryBudget,
  recoveryDelay,
} from '@/services/executions/recovery';
import { ApiRequestError } from '@/services/http/api-json';
import { InvalidStreamError } from '@/services/executions/sse';

export { isBusyExecution, isSettledExecution } from '@/contexts/chat-session/execution-status';

interface ObserverOptions extends HandoverContext {
  readonly id: number;
  readonly text: string;
  readonly snapshot?: ExecutionSnapshot;
  readonly onClose: () => void;
}

/** How one attach ended when the turn is still streaming. */
interface AttachOutcome {
  /** The attach brought a step, delta or transition never shown, or a later stage. */
  readonly progressed: boolean;
  /** Transport failure, or the exception a handler raised; null for a clean close. */
  readonly error: unknown;
}

const DISCONNECTED =
  'Connexion interrompue. L’exécution peut continuer. Reconnectez-vous pour vérifier son état.';
const STOP_UNCONFIRMED = 'L’arrêt n’est pas encore confirmé. Vous pouvez réessayer.';

/** Owns observation only; server execution lifetime never depends on this browser controller. */
export function createExecutionObserver(options: ObserverOptions) {
  const { client, conversationId, controller, dispatch, id, text, userId } = options;
  const submissionId = crypto.randomUUID();
  let cursor: string | null = null;
  /** Revision of the last accepted JSON snapshot; AG-UI frames carry no revision. */
  let jsonRevision = -1;
  const answer = new LiveAnswer();
  const work = new LiveWork();
  /** Settled state announced by the stream; the turn settles on the AG-UI lifecycle end. */
  let settledState: Execution | null = null;
  let isObserving = false;
  let isStopping = false;
  let faultReported = false;
  /** Every element any attach or read has shown: an attach progresses only beyond it. */
  const shown = new AttachProgress();
  let handover: Promise<void> | undefined;
  const content = () => ({
    assistantText: answer.text,
    activities: answer.activities,
    work: work.view,
  });
  const publisher = createTurnPublisher({
    initial: {
      assistantText: '',
      activities: [],
      work: EMPTY_WORK,
      error: null,
      execution: null,
      status: 'streaming',
      userMessage: text,
      connection: 'connecting',
      stopPending: false,
    },
    signal: controller.signal,
    dispatch: (turn) => dispatch({ type: 'update', id, turn }),
    content,
  });
  const turn = () => publisher.turn;
  const update = (patch: Partial<LiveTurn>) => publisher.update(patch);
  const disconnect = () => update({ connection: 'disconnected', error: DISCONNECTED });
  const cache = createConversationCache(options.queryClient, userId);
  const title = (conversation: Conversation) => {
    if (controller.signal.aborted) return;
    if (conversation.id !== conversationId) throw new InvalidStreamError();
    cache(conversation);
  };
  const assertIdentity = (execution: Execution) => {
    const known = turn().execution;
    if (
      execution.conversationId !== conversationId ||
      (known !== null && execution.id !== known.id)
    )
      throw new InvalidStreamError();
  };
  /** False when the product state must not move the turn: settled turn, stale stage delivery. */
  const admits = (execution: Execution) => {
    if (turn().status !== 'streaming' && !isSettledExecution(execution)) return false;
    return advances(turn().execution, execution);
  };
  const commit = (execution: Execution, patch: Partial<LiveTurn>) => {
    const settled = isSettledExecution(execution);
    // Settling publishes the rebuilt content: a replay that reaches the lifecycle end is complete.
    if (settled) publisher.release();
    // A parked execution whose end is confirmed keeps its saved text and reads as a failed turn.
    const failed = failedExecution(execution);
    update({
      ...patch,
      execution,
      error: failed ? (execution.error ?? 'L’agent a échoué.') : null,
      status: failed ? 'error' : settled ? 'done' : 'streaming',
      connection: 'connected',
      stopPending: !settled && (turn().stopPending === true || execution.status === 'stopping'),
    });
    if (settled) handover ??= handOver(options, turn());
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
    if (taken) {
      cursor = snapshot.cursor;
      work.read(snapshot);
    }
    commit(snapshot.execution, taken ? { ...content(), userMessage: snapshot.userMessage } : {});
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
      if (turn().status === 'streaming')
        update({ execution: state.execution, userMessage: state.userMessage });
      return;
    }
    commit(state.execution, { userMessage: state.userMessage });
  };
  const finishRun = (fallback: () => void) => {
    if (turn().status !== 'streaming') return;
    if (settledState !== null) commit(settledState, content());
    else fallback();
  };
  const handlers = (agent: AlfredExecutionAgent) =>
    createLiveHandlers(agent, {
      conversationId,
      userId,
      answer,
      work,
      state: acceptState,
      live: () => publisher.progress(),
      settle: finishRun,
      fail: (message) => {
        publisher.release();
        update({ status: 'error', error: message, connection: 'connected' });
      },
      restart: () => {
        settledState = null;
        publisher.hold();
      },
      applied: (resynthesized) => (resynthesized ? publisher.replayed() : publisher.touch()),
      executionId: () => turn().execution?.id,
      cursor: (value) => {
        cursor = value;
      },
    });
  dispatch({
    type: 'start',
    session: {
      conversationId,
      id,
      turn: turn(),
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
        if (turn().stopPending) stop();
        return true;
      } catch (error) {
        if (controller.signal.aborted) return false;
        if (error instanceof ApiRequestError && !isRetryable(error)) {
          update({
            status: 'error',
            connection: 'disconnected',
            error: describeApiError(error, 'L’envoi du message a échoué.'),
          });
          return false;
        }
        update({ connection: 'recovering' });
        if (attempt < RECOVERY_ATTEMPTS - 1) await recoveryDelay(attempt, controller.signal);
      }
    }
    // Creation might have committed. Retain the same submission id for an explicit retry.
    disconnect();
    return false;
  };

  /** One attach: the replay of the run, then its continuation until the stream ends. */
  const attach = async (executionId: string): Promise<AttachOutcome | null> => {
    // The AG-UI client and its dependencies load on demand, outside the initial bundle.
    const { AlfredExecutionAgent } = await import('@/services/executions/ag-ui-agent');
    // Detachment or a settled turn while the module loaded must not open an observation.
    if (controller.signal.aborted || turn().status !== 'streaming') return null;
    const agent = new AlfredExecutionAgent({
      client,
      conversationId,
      cursor,
      executionId,
      signal: controller.signal,
    });
    shown.record(turn());
    const stage = turn().execution?.status;
    const subscriber = createAgUiSubscriber(agent, handlers(agent), controller.signal);
    try {
      await agent.runAgent({ runId: executionId }, subscriber);
    } finally {
      publisher.end();
    }
    cursor = agent.cursor;
    const invalid = subscriber.invalid();
    if (invalid !== null) throw invalid;
    const fault = subscriber.fault();
    if (fault !== null) {
      // A browser bug is not a transport fault: it never counts as progress, and shows once.
      if (!faultReported) reportRuntimeEventFault(userId, conversationId, fault);
      faultReported = true;
      return { progressed: false, error: fault };
    }
    // Replaying known content is not progress, whatever the server sends: the attach progressed
    // only if it brought a step, a text delta or a transition never shown, or the stage moved on.
    // A shown step reading shorter afterwards (bounded narration) never hides that progress.
    const grew = shown.record(content());
    const progressed = grew || turn().execution?.status !== stage;
    return { progressed, error: agent.failure };
  };

  /**
   * Observes until the run settles. An attach that brought progress re-attaches promptly; only
   * consecutive fruitless attempts back off and count toward the budget. The recovery read before
   * each re-attach decides whether the execution settled while no stream was open.
   */
  const observe = async () => {
    const executionId = turn().execution?.id;
    if (executionId === undefined) return;
    const budget = new RecoveryBudget();
    for (let attempt = 0; ; attempt += 1) {
      let prompt = false;
      try {
        if (attempt > 0) acceptSnapshot(await getExecution(client, executionId, controller.signal));
        if (turn().status !== 'streaming') return;
        const outcome = await attach(executionId);
        if (outcome === null || controller.signal.aborted || turn().status !== 'streaming') return;
        if (outcome.error !== null && !isRetryable(outcome.error)) {
          disconnect();
          return;
        }
        if (outcome.progressed) budget.progressed();
        prompt = outcome.progressed;
        if (!prompt && !budget.failed()) {
          disconnect();
          return;
        }
      } catch (error) {
        if (controller.signal.aborted || turn().status !== 'streaming') return;
        if (!isRetryable(error) || !budget.failed()) {
          disconnect();
          return;
        }
      }
      if (prompt) await reattachDelay(controller.signal);
      else {
        update({ connection: 'recovering', error: null });
        await recoveryDelay(budget.attempt - 1, controller.signal);
      }
    }
  };

  const start = () => {
    if (isObserving || controller.signal.aborted) return;
    isObserving = true;
    update({ connection: 'connecting', error: null });
    void (async () => {
      if (turn().execution === null && !(await create())) return;
      await observe();
    })()
      .catch(() => {
        if (!controller.signal.aborted && turn().status === 'streaming') disconnect();
      })
      .finally(async () => {
        isObserving = false;
        // Keep this controller available to logout while the stored transcript is reconciling.
        if (turn().status !== 'streaming') {
          publisher.dispose();
          await handover;
          options.onClose();
        }
      });
  };

  const stop = () => {
    if (isStopping || controller.signal.aborted || turn().status !== 'streaming') return;
    const executionId = turn().execution?.id;
    if (executionId === undefined) {
      update({ stopPending: true });
      start();
      return;
    }
    isStopping = true;
    update({ stopPending: true, error: null });
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
      update({ error: STOP_UNCONFIRMED });
    })()
      .catch(() => {
        if (!controller.signal.aborted) update({ error: STOP_UNCONFIRMED });
      })
      .finally(() => {
        isStopping = false;
      });
  };

  return {
    conversationId,
    controller,
    executionId: () => turn().execution?.id,
    isActive: () => turn().status === 'streaming',
    /** True while the answer is genuinely advancing; parked work lets the user write again. */
    blocksComposer: () => turn().status === 'streaming' && isBusyExecution(turn().execution),
    start,
    stop,
  };
}
