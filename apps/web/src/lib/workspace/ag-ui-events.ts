import {
  alfredRunStateSchema,
  EXECUTION_OUTPUT_MAX_LENGTH,
  EXECUTION_REASONING_MAX_LENGTH,
  EXECUTION_TOOL_RESULT_CONTENTS,
  EXECUTION_WORK_LABEL_MAX_LENGTH,
  EXECUTION_WORK_MAX_STEPS,
  EXECUTION_WORK_OMITTED_EVENT,
  type AlfredRunState,
} from '@alfred/contracts';
import {
  EventSchemas,
  EventType,
  type CustomEvent,
  type ReasoningEndEvent,
  type ReasoningMessageContentEvent,
  type ReasoningMessageEndEvent,
  type ReasoningMessageStartEvent,
  type ReasoningStartEvent,
  type RunErrorEvent,
  type RunFinishedEvent,
  type RunStartedEvent,
  type StateSnapshotEvent,
  type StepFinishedEvent,
  type StepStartedEvent,
  type SubagentErrorEvent,
  type SubagentFinishedEvent,
  type SubagentStartedEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type TextMessageStartEvent,
  type ToolCallEndEvent,
  type ToolCallResultEvent,
  type ToolCallStartEvent,
} from '@ag-ui/core';

/**
 * The AG-UI events the Alfred API emits on `GET /executions/:id/events`. Tool arguments, result
 * bodies and specialist prompts never cross the product boundary (ADR 0023, ALF-DEC-037):
 * `TOOL_CALL_ARGS` is refused, a `TOOL_CALL_RESULT` may only carry the bounded status vocabulary,
 * a specialist carries a name and no description or report. Reasoning text and a specialist's
 * own messages arrive when the deployment exposes work content, owned through `subagentRunId`.
 */
export type AlfredAgUiEvent =
  | RunStartedEvent
  | (RunFinishedEvent & { readonly outcome?: { readonly type: 'success' } })
  | RunErrorEvent
  | (StateSnapshotEvent & { readonly snapshot: AlfredRunState })
  | WorkOmittedEvent
  | (TextMessageStartEvent & { readonly role: 'assistant' })
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ReasoningStartEvent
  | ReasoningMessageStartEvent
  | ReasoningMessageContentEvent
  | ReasoningMessageEndEvent
  | ReasoningEndEvent
  | StepStartedEvent
  | StepFinishedEvent
  | ToolCallStartEvent
  | ToolCallEndEvent
  | (ToolCallResultEvent & { readonly content: (typeof EXECUTION_TOOL_RESULT_CONTENTS)[number] })
  | SubagentStartedEvent
  | (SubagentFinishedEvent & { readonly outcome?: { readonly type: 'success' } })
  | SubagentErrorEvent;

/** The omitted steps of the work log, which the stream never sends one by one. */
export type WorkOmittedEvent = CustomEvent & {
  readonly name: typeof EXECUTION_WORK_OMITTED_EVENT;
  readonly value: { readonly omittedSteps: number };
};

const TOOL_RESULT_CONTENTS: ReadonlySet<string> = new Set(EXECUTION_TOOL_RESULT_CONTENTS);
const MAX_ID_LENGTH = 128;

export interface AgUiEventScope {
  /** When given, the run identity and the state must belong to this execution. */
  readonly executionId?: string;
  /** When given, the state must belong to this conversation. */
  readonly conversationId?: string;
}

const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
const validLabel = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= EXECUTION_WORK_LABEL_MAX_LENGTH;

/** The optional owner of a message, tool call or marker: a specialist invocation id. */
function owner(value: unknown): { readonly subagentRunId?: string } | null {
  if (value === undefined) return {};
  return validId(value) ? { subagentRunId: value } : null;
}

/**
 * Validates one wire payload against the official AG-UI schemas, keeps only the events of the
 * Alfred contract and copies only their known fields, so no private or unexpected field survives
 * into the live turn or the diagnostics. Returns null for anything else.
 */
export function canonicalAgUiEvent(
  value: unknown,
  scope: AgUiEventScope = {},
): AlfredAgUiEvent | null {
  const parsed = EventSchemas.safeParse(value);
  if (!parsed.success) return null;
  const event = parsed.data;
  // A server moment in milliseconds; anything else is not a moment and is dropped.
  const base =
    typeof event.timestamp === 'number' &&
    Number.isSafeInteger(event.timestamp) &&
    event.timestamp > 0
      ? { timestamp: event.timestamp }
      : {};
  switch (event.type) {
    case EventType.RUN_STARTED:
      if (scope.executionId !== undefined && event.runId !== scope.executionId) return null;
      if (scope.conversationId !== undefined && event.threadId !== scope.conversationId)
        return null;
      return { ...base, type: event.type, threadId: event.threadId, runId: event.runId };
    case EventType.RUN_FINISHED:
      if (scope.executionId !== undefined && event.runId !== scope.executionId) return null;
      if (scope.conversationId !== undefined && event.threadId !== scope.conversationId)
        return null;
      // HITL interrupt outcomes are outside this profile (ALF-DEC-009): only success survives.
      if (event.outcome != null && event.outcome.type !== 'success') return null;
      return {
        ...base,
        type: event.type,
        threadId: event.threadId,
        runId: event.runId,
        ...(event.outcome == null ? {} : { outcome: { type: 'success' as const } }),
      };
    case EventType.RUN_ERROR:
      return {
        ...base,
        type: event.type,
        message: event.message,
        ...(event.code === undefined ? {} : { code: event.code }),
      };
    case EventType.CUSTOM: {
      if (event.name !== EXECUTION_WORK_OMITTED_EVENT) return null;
      const omittedSteps: unknown =
        typeof event.value === 'object' && event.value !== null
          ? (event.value as { omittedSteps?: unknown }).omittedSteps
          : undefined;
      // Any count of an execution's steps: far above the recorded bound, never unbounded.
      if (
        typeof omittedSteps !== 'number' ||
        !Number.isSafeInteger(omittedSteps) ||
        omittedSteps < 0 ||
        omittedSteps > EXECUTION_WORK_MAX_STEPS * 1_024
      )
        return null;
      return { ...base, type: event.type, name: event.name, value: { omittedSteps } };
    }
    case EventType.STATE_SNAPSHOT: {
      const state = alfredRunStateSchema.safeParse(event.snapshot);
      if (!state.success) return null;
      const { execution, conversation } = state.data;
      if (
        execution.conversationId !== conversation.id ||
        (scope.executionId !== undefined && execution.id !== scope.executionId) ||
        (scope.conversationId !== undefined && conversation.id !== scope.conversationId)
      )
        return null;
      return { ...base, type: event.type, snapshot: state.data };
    }
    case EventType.TEXT_MESSAGE_START: {
      // Every message is Alfred's or a specialist's own words; no other role is rendered.
      const by = owner(event.subagentRunId);
      if (event.role !== 'assistant' || by === null) return null;
      return { ...base, type: event.type, messageId: event.messageId, role: 'assistant', ...by };
    }
    case EventType.TEXT_MESSAGE_CONTENT: {
      const by = owner(event.subagentRunId);
      // One delta can never exceed the bounded answer of the JSON profile.
      if (by === null || event.delta.length > EXECUTION_OUTPUT_MAX_LENGTH) return null;
      return { ...base, type: event.type, messageId: event.messageId, delta: event.delta, ...by };
    }
    case EventType.TEXT_MESSAGE_END: {
      const by = owner(event.subagentRunId);
      if (by === null) return null;
      return { ...base, type: event.type, messageId: event.messageId, ...by };
    }
    case EventType.REASONING_START:
    case EventType.REASONING_END:
    case EventType.REASONING_MESSAGE_END: {
      const by = owner(event.subagentRunId);
      if (by === null || !validId(event.messageId)) return null;
      return { ...base, type: event.type, messageId: event.messageId, ...by };
    }
    case EventType.REASONING_MESSAGE_START: {
      const by = owner(event.subagentRunId);
      if (by === null || !validId(event.messageId)) return null;
      return { ...base, type: event.type, messageId: event.messageId, role: 'reasoning', ...by };
    }
    case EventType.REASONING_MESSAGE_CONTENT: {
      const by = owner(event.subagentRunId);
      if (
        by === null ||
        !validId(event.messageId) ||
        event.delta.length > EXECUTION_REASONING_MAX_LENGTH
      )
        return null;
      return { ...base, type: event.type, messageId: event.messageId, delta: event.delta, ...by };
    }
    case EventType.STEP_STARTED:
    case EventType.STEP_FINISHED: {
      // A step of the orchestrator only: an empty model round trip.
      if (event.subagentRunId !== undefined || !validId(event.stepName)) return null;
      return { ...base, type: event.type, stepName: event.stepName };
    }
    case EventType.TOOL_CALL_START: {
      const by = owner(event.subagentRunId);
      if (by === null || !validLabel(event.toolCallName)) return null;
      return {
        ...base,
        type: event.type,
        toolCallId: event.toolCallId,
        toolCallName: event.toolCallName,
        ...(event.parentMessageId == null ? {} : { parentMessageId: event.parentMessageId }),
        ...by,
      };
    }
    case EventType.TOOL_CALL_END: {
      const by = owner(event.subagentRunId);
      if (by === null) return null;
      return { ...base, type: event.type, toolCallId: event.toolCallId, ...by };
    }
    case EventType.TOOL_CALL_RESULT: {
      const by = owner(event.subagentRunId);
      if (by === null || !TOOL_RESULT_CONTENTS.has(event.content)) return null;
      const content = event.content as (typeof EXECUTION_TOOL_RESULT_CONTENTS)[number];
      return {
        ...base,
        type: event.type,
        messageId: event.messageId,
        toolCallId: event.toolCallId,
        content,
        ...(event.role === undefined ? {} : { role: event.role }),
        ...by,
      };
    }
    case EventType.SUBAGENT_STARTED:
      // A flat delegation topology (ALF-DEC-036) with a name only: no prompt, no nesting.
      if (
        event.description !== undefined ||
        event.parentSubagentRunId !== undefined ||
        !validId(event.subagentRunId) ||
        !validLabel(event.name)
      )
        return null;
      return {
        ...base,
        type: event.type,
        subagentRunId: event.subagentRunId,
        name: event.name,
        ...(event.parentToolCallId === undefined
          ? {}
          : { parentToolCallId: event.parentToolCallId }),
        ...(event.parentMessageId === undefined ? {} : { parentMessageId: event.parentMessageId }),
      };
    case EventType.SUBAGENT_FINISHED:
      // A specialist's report never crosses the boundary; only success is a known outcome.
      if (event.result !== undefined || !validId(event.subagentRunId)) return null;
      if (event.outcome != null && event.outcome.type !== 'success') return null;
      return {
        ...base,
        type: event.type,
        subagentRunId: event.subagentRunId,
        ...(event.outcome == null ? {} : { outcome: { type: 'success' as const } }),
      };
    case EventType.SUBAGENT_ERROR:
      if (!validId(event.subagentRunId)) return null;
      return {
        ...base,
        type: event.type,
        subagentRunId: event.subagentRunId,
        message: event.message,
        ...(event.code === undefined ? {} : { code: event.code }),
      };
    default:
      return null;
  }
}
