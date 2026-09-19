import {
  alfredRunStateSchema,
  EXECUTION_OUTPUT_MAX_LENGTH,
  EXECUTION_TOOL_RESULT_CONTENTS,
  type AlfredRunState,
} from '@alfred/contracts';
import {
  EventSchemas,
  EventType,
  type RunErrorEvent,
  type RunFinishedEvent,
  type RunStartedEvent,
  type StateSnapshotEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type TextMessageStartEvent,
  type ToolCallEndEvent,
  type ToolCallResultEvent,
  type ToolCallStartEvent,
} from '@ag-ui/core';

/**
 * The AG-UI events the Alfred API emits on `GET /executions/:id/events`. Tool arguments and
 * result bodies never cross the product boundary (ADR 0023, ALF-DEC-037): `TOOL_CALL_ARGS` is
 * refused and a `TOOL_CALL_RESULT` may only carry the bounded status vocabulary.
 */
export type AlfredAgUiEvent =
  | RunStartedEvent
  | (RunFinishedEvent & { readonly outcome?: { readonly type: 'success' } })
  | RunErrorEvent
  | (StateSnapshotEvent & { readonly snapshot: AlfredRunState })
  | (TextMessageStartEvent & { readonly role: 'assistant' })
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallEndEvent
  | (ToolCallResultEvent & { readonly content: (typeof EXECUTION_TOOL_RESULT_CONTENTS)[number] });

const TOOL_RESULT_CONTENTS: ReadonlySet<string> = new Set(EXECUTION_TOOL_RESULT_CONTENTS);

export interface AgUiEventScope {
  /** When given, the run identity and the state must belong to this execution. */
  readonly executionId?: string;
  /** When given, the state must belong to this conversation. */
  readonly conversationId?: string;
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
  const base = event.timestamp === undefined ? {} : { timestamp: event.timestamp };
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
    case EventType.TEXT_MESSAGE_START:
      // Every visible message is Alfred's answer; no other role is rendered or recorded.
      if (event.role !== 'assistant') return null;
      return { ...base, type: event.type, messageId: event.messageId, role: 'assistant' };
    case EventType.TEXT_MESSAGE_CONTENT:
      // One delta can never exceed the bounded answer of the JSON profile.
      if (event.delta.length > EXECUTION_OUTPUT_MAX_LENGTH) return null;
      return { ...base, type: event.type, messageId: event.messageId, delta: event.delta };
    case EventType.TEXT_MESSAGE_END:
      return { ...base, type: event.type, messageId: event.messageId };
    case EventType.TOOL_CALL_START:
      return {
        ...base,
        type: event.type,
        toolCallId: event.toolCallId,
        toolCallName: event.toolCallName,
        ...(event.parentMessageId == null ? {} : { parentMessageId: event.parentMessageId }),
      };
    case EventType.TOOL_CALL_END:
      return { ...base, type: event.type, toolCallId: event.toolCallId };
    case EventType.TOOL_CALL_RESULT: {
      if (!TOOL_RESULT_CONTENTS.has(event.content)) return null;
      const content = event.content as (typeof EXECUTION_TOOL_RESULT_CONTENTS)[number];
      return {
        ...base,
        type: event.type,
        messageId: event.messageId,
        toolCallId: event.toolCallId,
        content,
        ...(event.role === undefined ? {} : { role: event.role }),
      };
    }
    default:
      return null;
  }
}
