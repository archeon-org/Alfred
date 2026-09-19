import type { AgentSubscriber } from '@ag-ui/client';
import { AGUIError } from '@ag-ui/core';
import type { AlfredRunState } from '@alfred/contracts';

import type { AlfredExecutionAgent } from '@/services/executions/ag-ui-agent';
import { InvalidStreamError } from '@/services/executions/sse';

type Moment = number | undefined;
type Owner = string | undefined;

/** What the observer does with each AG-UI event; a thrown error ends the attach. */
export interface AgUiHandlers {
  readonly runStarted: (threadId: string) => void;
  readonly state: (state: AlfredRunState) => void;
  /** How many steps the work log counted without sending them. */
  readonly workOmitted: (omittedSteps: number) => void;
  readonly messageStart: (messageId: string, at: Moment, owner: Owner) => void;
  readonly messageDelta: (messageId: string, delta: string, at: Moment, owner: Owner) => void;
  readonly messageEnd: (messageId: string, at: Moment, owner: Owner) => void;
  readonly reasoningStart: (messageId: string, at: Moment, owner: Owner) => void;
  readonly reasoningDelta: (messageId: string, delta: string, at: Moment) => void;
  readonly reasoningEnd: (messageId: string, at: Moment) => void;
  readonly stepStarted: (stepName: string, at: Moment) => void;
  readonly stepFinished: (stepName: string, at: Moment) => void;
  readonly toolStart: (toolCallId: string, toolCallName: string, at: Moment, owner: Owner) => void;
  readonly toolResult: (toolCallId: string, content: string, at: Moment) => void;
  readonly subagentStarted: (
    subagentRunId: string,
    name: string,
    at: Moment,
    parentToolCallId: string | undefined,
  ) => void;
  readonly subagentFinished: (subagentRunId: string, at: Moment) => void;
  readonly subagentError: (subagentRunId: string, code: string | undefined, at: Moment) => void;
  readonly runFinished: () => void;
  readonly runError: (message: string) => void;
  readonly event: (event: { readonly type: string }) => Promise<void>;
  /** Every event was applied; `resynthesized` is true for the last event of the attach replay. */
  readonly applied: (resynthesized: boolean) => void;
}

type Stamped = { readonly timestamp?: number; readonly subagentRunId?: string };

export interface ObservedSubscriber extends AgentSubscriber {
  /** A frame the contract refuses: the observation fails closed without a retry. */
  readonly invalid: () => Error | null;
  /** An unexpected exception of the browser while applying an event: a bug, not a transport. */
  readonly fault: () => Error | null;
}

/**
 * Adapts the AG-UI subscriber callbacks to the observer. The AG-UI client logs and swallows
 * exceptions thrown by subscribers, so the first one is recorded here and the transport ended;
 * the observer then fails closed on an invalid frame and counts a fault as a fruitless attempt.
 */
export function createAgUiSubscriber(
  agent: AlfredExecutionAgent,
  handlers: AgUiHandlers,
  signal: AbortSignal,
): ObservedSubscriber {
  let invalid: Error | null = null;
  let fault: Error | null = null;
  /** Events applied during this attach; the replay ends with the first cursor. */
  let accepted = 0;
  const stop = (error: unknown) => {
    if (error instanceof InvalidStreamError || error instanceof AGUIError) invalid = error;
    else fault = error instanceof Error ? error : new Error('Observation handler failed');
    agent.abort();
  };
  const handling = () => invalid === null && fault === null && !signal.aborted;
  /** Applies one typed event; each AG-UI event reaches exactly one typed callback. */
  const guarded =
    <T>(handle: (event: T) => void) =>
    ({ event }: { readonly event: T }) => {
      if (!handling()) return;
      try {
        handle(event);
        accepted += 1;
        handlers.applied(accepted === agent.resynthesis);
      } catch (error) {
        stop(error);
      }
    };
  const none = guarded(() => undefined);
  return {
    invalid: () => invalid,
    fault: () => fault,
    onRunStartedEvent: guarded((event: { readonly threadId: string }) =>
      handlers.runStarted(event.threadId),
    ),
    onStateSnapshotEvent: guarded((event: { readonly snapshot?: unknown }) =>
      handlers.state(event.snapshot as AlfredRunState),
    ),
    // The contract admits one custom event only; its payload was validated with the frame.
    onCustomEvent: guarded((event: { readonly value?: unknown }) =>
      handlers.workOmitted((event.value as { readonly omittedSteps: number }).omittedSteps),
    ),
    onTextMessageStartEvent: guarded((event: Stamped & { readonly messageId: string }) =>
      handlers.messageStart(event.messageId, event.timestamp, event.subagentRunId),
    ),
    onTextMessageContentEvent: guarded(
      (event: Stamped & { readonly messageId: string; readonly delta: string }) =>
        handlers.messageDelta(event.messageId, event.delta, event.timestamp, event.subagentRunId),
    ),
    onTextMessageEndEvent: guarded((event: Stamped & { readonly messageId: string }) =>
      handlers.messageEnd(event.messageId, event.timestamp, event.subagentRunId),
    ),
    onReasoningStartEvent: guarded((event: Stamped & { readonly messageId: string }) =>
      handlers.reasoningStart(event.messageId, event.timestamp, event.subagentRunId),
    ),
    onReasoningMessageStartEvent: none,
    onReasoningMessageContentEvent: guarded(
      (event: Stamped & { readonly messageId: string; readonly delta: string }) =>
        handlers.reasoningDelta(event.messageId, event.delta, event.timestamp),
    ),
    onReasoningMessageEndEvent: none,
    onReasoningEndEvent: guarded((event: Stamped & { readonly messageId: string }) =>
      handlers.reasoningEnd(event.messageId, event.timestamp),
    ),
    onStepStartedEvent: guarded((event: Stamped & { readonly stepName: string }) =>
      handlers.stepStarted(event.stepName, event.timestamp),
    ),
    onStepFinishedEvent: guarded((event: Stamped & { readonly stepName: string }) =>
      handlers.stepFinished(event.stepName, event.timestamp),
    ),
    onToolCallStartEvent: guarded(
      (event: Stamped & { readonly toolCallId: string; readonly toolCallName: string }) =>
        handlers.toolStart(
          event.toolCallId,
          event.toolCallName,
          event.timestamp,
          event.subagentRunId,
        ),
    ),
    onToolCallEndEvent: none,
    onToolCallResultEvent: guarded(
      (event: Stamped & { readonly toolCallId: string; readonly content: string }) =>
        handlers.toolResult(event.toolCallId, event.content, event.timestamp),
    ),
    onSubagentStartedEvent: guarded(
      (
        event: Stamped & {
          readonly subagentRunId: string;
          readonly name: string;
          readonly parentToolCallId?: string;
        },
      ) =>
        handlers.subagentStarted(
          event.subagentRunId,
          event.name,
          event.timestamp,
          event.parentToolCallId,
        ),
    ),
    onSubagentFinishedEvent: guarded((event: Stamped & { readonly subagentRunId: string }) =>
      handlers.subagentFinished(event.subagentRunId, event.timestamp),
    ),
    onSubagentErrorEvent: guarded(
      (event: Stamped & { readonly subagentRunId: string; readonly code?: string }) =>
        handlers.subagentError(event.subagentRunId, event.code, event.timestamp),
    ),
    onRunFinishedEvent: guarded(() => handlers.runFinished()),
    onRunErrorEvent: guarded((event: { readonly message: string }) =>
      handlers.runError(event.message),
    ),
    onEvent: async ({ event }: { readonly event: { readonly type: string } }) => {
      if (!handling()) return;
      try {
        await handlers.event(event);
      } catch (error) {
        stop(error);
      }
    },
  };
}
