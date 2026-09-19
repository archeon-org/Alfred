import type { AlfredRunState, Execution, ExecutionStatus } from '@alfred/contracts';
import {
  EventType,
  type BaseEvent,
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

/** AG-UI events Alfred emits. Every identifier is a product id or an opaque projection hash. */
export type AgUiEvent =
  | RunStartedEvent
  | StateSnapshotEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | RunFinishedEvent
  | RunErrorEvent;

export interface ObservedToolCall {
  readonly id: string;
  readonly label: string;
  readonly status: 'running' | 'completed' | 'failed';
  readonly messageId: string;
}

/**
 * What one observer has seen of an execution: the product state, the visible answer and the
 * visible tool calls. It is derived from the committed projection, never from an event log
 * (ALF-DEC-006 §5/§6), so every attach re-synthesizes the run from this view.
 */
export interface ObservedView {
  readonly state: AlfredRunState;
  readonly message: { readonly id: string; readonly text: string } | null;
  readonly toolCalls: readonly ObservedToolCall[];
  readonly settled: boolean;
}

/**
 * The projection moved in a way AG-UI cannot express as a continuation (visible text replaced,
 * a tool call withdrawn). The observer closes and the browser re-attaches for a fresh synthesis.
 */
export class AgUiTranslationGap extends Error {
  constructor() {
    super('The observed projection does not continue the frames already sent.');
    this.name = 'AgUiTranslationGap';
  }
}

const RUN_ERROR_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'failed',
  'timed_out',
  'recovery_required',
  'interrupted',
]);

const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * Events that bring an observer from `previous` (null on attach) to `next`. The sequence is
 * verifier-clean: one open text message at a time, tool calls closed on emission, everything
 * closed before the lifecycle end. Identical views produce no events.
 */
export function translateObservedView(
  previous: ObservedView | null,
  next: ObservedView,
): AgUiEvent[] {
  const events: AgUiEvent[] = [];
  const run = runIdentity(next.state.execution);
  if (previous === null) {
    events.push({ type: EventType.RUN_STARTED, ...run });
    events.push({ type: EventType.STATE_SNAPSHOT, snapshot: next.state });
    for (const tool of next.toolCalls) events.push(...openToolCall(tool));
    if (next.message !== null) events.push(...openMessage(next.message));
  } else {
    if (!same(previous.state, next.state))
      events.push({ type: EventType.STATE_SNAPSHOT, snapshot: next.state });
    events.push(...progressToolCalls(previous.toolCalls, next.toolCalls));
    events.push(...progressMessage(previous.message, next.message));
  }
  if (next.settled) {
    if (next.message !== null)
      events.push({ type: EventType.TEXT_MESSAGE_END, messageId: next.message.id });
    events.push(finish(next.state.execution, run));
  }
  return events;
}

function runIdentity(execution: Execution): { threadId: string; runId: string } {
  return { threadId: execution.conversationId, runId: execution.id };
}

function openMessage(message: { readonly id: string; readonly text: string }): AgUiEvent[] {
  const events: AgUiEvent[] = [
    { type: EventType.TEXT_MESSAGE_START, messageId: message.id, role: 'assistant' },
  ];
  if (message.text !== '')
    events.push({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: message.id,
      delta: message.text,
    });
  return events;
}

function progressMessage(
  previous: ObservedView['message'],
  next: ObservedView['message'],
): AgUiEvent[] {
  if (next === null) {
    if (previous === null) return [];
    throw new AgUiTranslationGap();
  }
  if (previous === null) return openMessage(next);
  if (previous.id !== next.id) {
    return [{ type: EventType.TEXT_MESSAGE_END, messageId: previous.id }, ...openMessage(next)];
  }
  if (!next.text.startsWith(previous.text)) throw new AgUiTranslationGap();
  const delta = next.text.slice(previous.text.length);
  return delta === '' ? [] : [{ type: EventType.TEXT_MESSAGE_CONTENT, messageId: next.id, delta }];
}

function openToolCall(tool: ObservedToolCall): AgUiEvent[] {
  const events: AgUiEvent[] = [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: tool.id,
      toolCallName: tool.label,
      parentMessageId: tool.messageId,
    },
    { type: EventType.TOOL_CALL_END, toolCallId: tool.id },
  ];
  if (tool.status !== 'running') events.push(toolResult(tool));
  return events;
}

function toolResult(tool: ObservedToolCall): ToolCallResultEvent {
  return {
    type: EventType.TOOL_CALL_RESULT,
    messageId: `${tool.id}:result`,
    toolCallId: tool.id,
    content: tool.status,
    role: 'tool',
  };
}

function progressToolCalls(
  previous: readonly ObservedToolCall[],
  next: readonly ObservedToolCall[],
): AgUiEvent[] {
  const seen = new Map(previous.map((tool) => [tool.id, tool]));
  const events: AgUiEvent[] = [];
  for (const tool of next) {
    const before = seen.get(tool.id);
    if (before === undefined) {
      events.push(...openToolCall(tool));
      continue;
    }
    seen.delete(tool.id);
    if (before.status === tool.status) continue;
    // A finished tool never reopens; a changed outcome cannot be expressed as a continuation.
    if (before.status !== 'running') throw new AgUiTranslationGap();
    events.push(toolResult(tool));
  }
  if (seen.size > 0) throw new AgUiTranslationGap();
  return events;
}

function finish(execution: Execution, run: { threadId: string; runId: string }): AgUiEvent {
  if (RUN_ERROR_STATUSES.has(execution.status)) {
    return {
      type: EventType.RUN_ERROR,
      message: execution.error ?? 'Runtime execution failed.',
      code: execution.errorCode ?? execution.status,
    };
  }
  return execution.status === 'completed'
    ? { type: EventType.RUN_FINISHED, ...run, outcome: { type: 'success' } }
    : { type: EventType.RUN_FINISHED, ...run };
}

export function isAgUiEvent(value: unknown): value is BaseEvent {
  return typeof value === 'object' && value !== null && 'type' in value;
}
