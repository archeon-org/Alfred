import { EventType } from '@ag-ui/core';
import type { WorkStepStatus } from '@alfred/contracts';
import type {
  ObservedMessage,
  ObservedStep,
} from '../../executions/infrastructure/langgraph/runtime-projection-work';
import type { AgUiEvent } from './ag-ui-translation';

/** Server milliseconds ride on every event; a step without a known moment carries none. */
export function stamp(ms: number | null | undefined): { readonly timestamp?: number } {
  return typeof ms === 'number' && ms > 0 ? { timestamp: ms } : {};
}

const SUBAGENT_ERRORS: Readonly<Record<string, { message: string; code: string }>> = {
  failed: { message: 'The specialist could not complete its task.', code: 'failed' },
  interrupted: { message: 'The specialist was interrupted.', code: 'interrupted' },
};

function owner(step: ObservedStep): { readonly subagentRunId?: string } {
  return step.parentId === undefined ? {} : { subagentRunId: step.parentId };
}

export function openMessage(message: ObservedMessage): AgUiEvent[] {
  const events: AgUiEvent[] = [
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: message.id,
      role: 'assistant',
      ...stamp(message.startedAt),
    },
  ];
  if (message.text !== '')
    events.push({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: message.id,
      delta: message.text,
      ...stamp(message.finishedAt),
    });
  return events;
}

export function endMessage(messageId: string, at: number | null): AgUiEvent {
  return { type: EventType.TEXT_MESSAGE_END, messageId, ...stamp(at) };
}

/**
 * A message step: the orchestrator's narration (always closed) or a specialist's intermediate
 * message, owned through its invocation and still open while it grows.
 */
export function openNarration(step: ObservedStep): AgUiEvent[] {
  const events: AgUiEvent[] = [
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: step.id,
      role: 'assistant',
      ...owner(step),
      ...stamp(step.startedAt),
    },
  ];
  if (step.text !== undefined && step.text !== '')
    events.push({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: step.id,
      delta: step.text,
      ...owner(step),
      ...stamp(step.finishedAt ?? step.startedAt),
    });
  if (step.status !== 'running') events.push(endNarration(step));
  return events;
}

export function narrationDelta(step: ObservedStep, delta: string): AgUiEvent {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: step.id,
    delta,
    ...owner(step),
    ...stamp(step.finishedAt ?? step.startedAt),
  };
}

export function endNarration(step: ObservedStep): AgUiEvent {
  return {
    type: EventType.TEXT_MESSAGE_END,
    messageId: step.id,
    ...owner(step),
    ...stamp(step.finishedAt),
  };
}

/** A reasoning marker, with its text as a reasoning message when the deployment exposes it. */
export function openReasoning(step: ObservedStep): AgUiEvent[] {
  const events: AgUiEvent[] = [
    {
      type: EventType.REASONING_START,
      messageId: step.id,
      ...owner(step),
      ...stamp(step.startedAt),
    },
  ];
  if (step.text !== undefined && step.text !== '') events.push(...reasoningText(step, step.text));
  if (step.status !== 'running') events.push(...endReasoning(step));
  return events;
}

/** The first text of a reasoning opens its message; later text continues it. */
export function reasoningText(step: ObservedStep, delta: string): AgUiEvent[] {
  return [
    {
      type: EventType.REASONING_MESSAGE_START,
      messageId: step.id,
      role: 'reasoning',
      ...owner(step),
      ...stamp(step.startedAt),
    },
    reasoningDelta(step, delta),
  ];
}

export function reasoningDelta(step: ObservedStep, delta: string): AgUiEvent {
  return {
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId: step.id,
    delta,
    ...owner(step),
    ...stamp(step.finishedAt ?? step.startedAt),
  };
}

export function endReasoning(step: ObservedStep): AgUiEvent[] {
  const events: AgUiEvent[] = [];
  if (step.text !== undefined && step.text !== '')
    events.push({
      type: EventType.REASONING_MESSAGE_END,
      messageId: step.id,
      ...owner(step),
      ...stamp(step.finishedAt),
    });
  events.push({
    type: EventType.REASONING_END,
    messageId: step.id,
    ...owner(step),
    ...stamp(step.finishedAt),
  });
  return events;
}

/** An empty model round trip: a step that started and finished with nothing to show. */
export function generation(step: ObservedStep): AgUiEvent[] {
  return [
    { type: EventType.STEP_STARTED, stepName: step.id, ...stamp(step.startedAt) },
    { type: EventType.STEP_FINISHED, stepName: step.id, ...stamp(step.finishedAt) },
  ];
}

/** The call itself, closed at once: arguments are never streamed (ALF-DEC-037). */
export function toolCall(step: ObservedStep): AgUiEvent[] {
  return [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: step.id,
      toolCallName: step.label,
      ...(step.messageId === undefined ? {} : { parentMessageId: step.messageId }),
      ...owner(step),
      ...stamp(step.startedAt),
    },
    {
      type: EventType.TOOL_CALL_END,
      toolCallId: step.id,
      ...owner(step),
      ...stamp(step.startedAt),
    },
  ];
}

/** The bounded outcome word; raw tool bodies never cross the product boundary. */
export function toolResult(step: ObservedStep): AgUiEvent {
  return {
    type: EventType.TOOL_CALL_RESULT,
    messageId: `${step.id}:result`,
    toolCallId: step.id,
    content: step.status,
    role: 'tool',
    ...owner(step),
    ...stamp(step.finishedAt),
  };
}

/** The specialist invocation a delegation started, or one seen at work without its delegation. */
export function subagentStarted(step: ObservedStep): AgUiEvent {
  return {
    type: EventType.SUBAGENT_STARTED,
    subagentRunId: step.id,
    name: step.specialist ?? 'specialist',
    ...(step.kind === 'delegation' ? { parentToolCallId: step.id } : {}),
    ...(step.messageId === undefined ? {} : { parentMessageId: step.messageId }),
    ...stamp(step.startedAt),
  };
}

export function subagentEnded(step: ObservedStep, status: WorkStepStatus): AgUiEvent {
  if (status === 'completed') {
    return {
      type: EventType.SUBAGENT_FINISHED,
      subagentRunId: step.id,
      outcome: { type: 'success' },
      ...stamp(step.finishedAt),
    };
  }
  const error = SUBAGENT_ERRORS[status] ?? SUBAGENT_ERRORS.failed!;
  return {
    type: EventType.SUBAGENT_ERROR,
    subagentRunId: step.id,
    message: error.message,
    code: error.code,
    ...stamp(step.finishedAt),
  };
}

/** True when the step is a specialist invocation the observer must open and close. */
export function invokesSubagent(step: ObservedStep): boolean {
  return step.subagentStatus !== undefined;
}
