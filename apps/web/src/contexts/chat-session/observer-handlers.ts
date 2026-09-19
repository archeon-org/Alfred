import type { AlfredRunState } from '@alfred/contracts';

import type { AgUiHandlers } from '@/contexts/chat-session/ag-ui-subscriber';
import type { LiveAnswer } from '@/contexts/chat-session/live-answer';
import type { LiveWork } from '@/contexts/chat-session/live-work';
import { captureRuntimeEvent } from '@/lib/workspace/runtime-event-debug';
import type { AlfredExecutionAgent } from '@/services/executions/ag-ui-agent';
import { InvalidStreamError } from '@/services/executions/sse';

/** Let React render and process input between bounded batches of AG-UI events. */
const EVENT_BATCH = 24;

/** What the handlers need from the observer that owns the turn. */
export interface HandlerContext {
  readonly conversationId: string;
  readonly userId: string;
  readonly answer: LiveAnswer;
  readonly work: LiveWork;
  /** Product state carried by `STATE_SNAPSHOT`. */
  readonly state: (state: AlfredRunState) => void;
  /** The answer or the work log changed: publish the streaming turn's content. */
  readonly live: () => void;
  /** Settles the turn on the settled state, or with the fallback when none was announced. */
  readonly settle: (fallback: () => void) => void;
  /** Ends the turn as an error when no settled state was announced. */
  readonly fail: (message: string) => void;
  /**
   * A new attach re-synthesizes the run: forget what an earlier attach announced and keep the
   * published content until the replay rebuilt it. Called before the live models are reset.
   */
  readonly restart: () => void;
  /** One event was applied; `resynthesized` marks the end of the attach's replay. */
  readonly applied: (resynthesized: boolean) => void;
  readonly executionId: () => string | undefined;
  readonly cursor: (value: string | null) => void;
}

/**
 * Routes each AG-UI event into the answer, the work log and the turn. A specialist's messages
 * (owned through `subagentRunId`) go to the log; the orchestrator's open message is the answer.
 */
export function createLiveHandlers(
  agent: AlfredExecutionAgent,
  context: HandlerContext,
): AgUiHandlers {
  const { answer, work, live } = context;
  let diagnosticSequence = 0;
  return {
    runStarted: (threadId) => {
      if (threadId !== context.conversationId) throw new InvalidStreamError();
      context.restart();
      answer.reset();
      work.reset();
    },
    state: context.state,
    workOmitted: (omittedSteps) => {
      work.omittedFrom(omittedSteps);
      live();
    },
    messageStart: (messageId, at, owner) => {
      // A specialist's message lives in the work log under its invocation. The orchestrator's
      // later message replaces the visible answer, which becomes narration in the log; the first
      // one keeps the last known text on screen until its content arrives.
      if (owner !== undefined) {
        work.childMessageStart(messageId, at, owner);
        live();
        return;
      }
      const previousText = answer.text;
      const replaced = answer.start(messageId);
      work.messageStart(messageId, at, previousText);
      if (replaced) live();
    },
    messageDelta: (messageId, delta, at, owner) => {
      if (owner !== undefined) {
        work.childMessageDelta(messageId, delta, at);
        live();
        return;
      }
      if (!answer.append(messageId, delta)) throw new InvalidStreamError();
      work.messageDelta(messageId, at);
      live();
    },
    messageEnd: (messageId, at, owner) => {
      if (owner === undefined) {
        work.messageEnd(messageId, at);
        return;
      }
      work.childMessageEnd(messageId, at);
      live();
    },
    reasoningStart: (messageId, at, owner) => {
      work.reasoningStart(messageId, at, owner);
      live();
    },
    reasoningDelta: (messageId, delta, at) => {
      work.reasoningDelta(messageId, delta, at);
      live();
    },
    reasoningEnd: (messageId, at) => {
      work.reasoningEnd(messageId, at);
      live();
    },
    stepStarted: (stepName, at) => {
      work.generationStarted(stepName, at);
      live();
    },
    stepFinished: (stepName, at) => {
      work.generationFinished(stepName, at);
      live();
    },
    toolStart: (toolCallId, toolCallName, at, owner) => {
      answer.toolStart(toolCallId, toolCallName);
      if (work.toolStart(toolCallId, toolCallName, at, owner)) live();
    },
    toolResult: (toolCallId, content, at) => {
      answer.toolResult(toolCallId, content);
      work.toolResult(toolCallId, content, at);
      live();
    },
    subagentStarted: (subagentRunId, name, at, parentToolCallId) => {
      work.subagentStarted(subagentRunId, name, at, parentToolCallId);
      live();
    },
    subagentFinished: (subagentRunId, at) => {
      work.subagentFinished(subagentRunId, at);
      live();
    },
    subagentError: (subagentRunId, code, at) => {
      work.subagentError(subagentRunId, code, at);
      live();
    },
    applied: context.applied,
    runFinished: () => context.settle(() => undefined),
    // The settled state normally precedes this; without it the run still ends as an error.
    runError: (message) => context.settle(() => context.fail(message)),
    event: async (event) => {
      context.cursor(agent.cursor);
      // Validated public events only, each filed under the execution being observed.
      const executionId = context.executionId();
      if (executionId !== undefined) {
        captureRuntimeEvent(context.userId, context.conversationId, {
          id: ++diagnosticSequence,
          executionId,
          event: event.type,
          data: event,
        });
      }
      if (diagnosticSequence % EVENT_BATCH === 0)
        await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}
