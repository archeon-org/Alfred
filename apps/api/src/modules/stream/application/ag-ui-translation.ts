import {
  EXECUTION_WORK_OMITTED_EVENT,
  type AlfredRunState,
  type Execution,
  type ExecutionStatus,
} from '@alfred/contracts';
import {
  EventType,
  type BaseEvent,
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
import type {
  ObservedMessage,
  ObservedStep,
} from '../../executions/infrastructure/langgraph/runtime-projection-work';
import {
  endMessage,
  endNarration,
  endReasoning,
  generation,
  invokesSubagent,
  narrationDelta,
  openMessage,
  openNarration,
  openReasoning,
  reasoningDelta,
  reasoningText,
  stamp,
  subagentEnded,
  subagentStarted,
  toolCall,
  toolResult,
} from './ag-ui-step-events';
import { AgUiTranslationGap } from './ag-ui-translation-gap';

export {
  AgUiTranslationGap,
  type AgUiGapRule,
  type AgUiGapStepKind,
} from './ag-ui-translation-gap';

/** AG-UI events Alfred emits. Every identifier is a product id or an opaque projection hash. */
export type AgUiEvent =
  | RunStartedEvent
  | StateSnapshotEvent
  | CustomEvent
  | TextMessageStartEvent
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
  | ToolCallResultEvent
  | SubagentStartedEvent
  | SubagentFinishedEvent
  | SubagentErrorEvent
  | RunFinishedEvent
  | RunErrorEvent;

export type { ObservedMessage, ObservedStep };

/**
 * What one observer has seen of an execution: the product state, the open answer and the steps
 * of the work behind it. It is derived from the committed projection, never from an event log
 * (ALF-DEC-006 §5/§6), so every attach re-synthesizes the run from this view.
 */
export interface ObservedView {
  readonly state: AlfredRunState;
  /** The latest visible root message: the answer in progress, or the final answer. */
  readonly answer: ObservedMessage | null;
  /** Narration, reasoning, tool calls and specialist invocations in first-seen order. */
  readonly steps: readonly ObservedStep[];
  readonly omittedSteps: number;
  readonly settled: boolean;
}

const RUN_ERROR_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'failed',
  'timed_out',
  'recovery_required',
  'interrupted',
]);
const RANK: Readonly<Record<string, number>> = {
  running: 0,
  completed: 1,
  failed: 1,
  interrupted: 1,
};

const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/** Activity timestamps move with every commit; only a meaningful change is worth a snapshot. */
function comparable(state: AlfredRunState): unknown {
  const { lastActivityAt: _activity, updatedAt: _updated, ...conversation } = state.conversation;
  void _activity;
  void _updated;
  return { ...state, conversation };
}

/**
 * Events that bring an observer from `previous` (null on attach) to `next`. The sequence is
 * verifier-clean: tool calls closed on emission, a specialist closed after its own steps and
 * before the lifecycle end, every open text or reasoning closed before it. Identical views produce
 * no events.
 */
export function translateObservedView(
  previous: ObservedView | null,
  next: ObservedView,
): AgUiEvent[] {
  const events: AgUiEvent[] = [];
  const run = runIdentity(next.state.execution);
  const closings: AgUiEvent[] = [];
  if (previous === null) {
    events.push({ type: EventType.RUN_STARTED, ...run });
    events.push({ type: EventType.STATE_SNAPSHOT, snapshot: next.state });
    for (const step of next.steps) events.push(...openStep(step, closings));
    if (next.omittedSteps > 0) events.push(omitted(next.omittedSteps));
    if (next.answer !== null) events.push(...openMessage(next.answer));
  } else {
    if (!same(comparable(previous.state), comparable(next.state)))
      events.push({ type: EventType.STATE_SNAPSHOT, snapshot: next.state });
    events.push(...progressSteps(previous, next, closings));
    if (next.omittedSteps !== previous.omittedSteps) events.push(omitted(next.omittedSteps));
    events.push(...progressAnswer(previous, next));
  }
  events.push(...closings);
  if (next.settled) {
    if (next.answer !== null) events.push(endMessage(next.answer.id, next.answer.finishedAt));
    events.push(finish(next.state.execution, run, next.answer));
  }
  return events;
}

/** Steps counted beyond the bound are never sent: the observer learns how many from this. */
function omitted(omittedSteps: number): CustomEvent {
  return { type: EventType.CUSTOM, name: EXECUTION_WORK_OMITTED_EVENT, value: { omittedSteps } };
}

function runIdentity(execution: Execution): { threadId: string; runId: string } {
  return { threadId: execution.conversationId, runId: execution.id };
}

/**
 * Opens one step as first seen. Outcomes of a specialist and of its delegation are deferred to
 * `closings` so they follow the events of the specialist's own steps.
 */
function openStep(step: ObservedStep, closings: AgUiEvent[]): AgUiEvent[] {
  switch (step.kind) {
    case 'message':
      return openNarration(step);
    case 'reasoning':
      return openReasoning(step);
    case 'generation':
      return generation(step);
    case 'tool':
      return step.status === 'running' ? toolCall(step) : [...toolCall(step), toolResult(step)];
    case 'delegation': {
      const events = toolCall(step);
      if (invokesSubagent(step)) {
        events.push(subagentStarted(step));
        if (step.subagentStatus !== 'running')
          closings.push(subagentEnded(step, step.subagentStatus!));
        if (step.status !== 'running') closings.push(toolResult(step));
      } else if (step.status !== 'running') events.push(toolResult(step));
      return events;
    }
    case 'subagent': {
      if (step.status !== 'running') closings.push(subagentEnded(step, step.status));
      return [subagentStarted(step)];
    }
  }
}

function progressSteps(
  previous: ObservedView,
  next: ObservedView,
  closings: AgUiEvent[],
): AgUiEvent[] {
  const before = new Map(previous.steps.map((step) => [step.id, step]));
  const events: AgUiEvent[] = [];
  for (const step of next.steps) {
    const was = before.get(step.id);
    if (was === undefined) {
      // The answer just opened became narration: close it instead of reopening it.
      if (step.kind === 'message' && previous.answer?.id === step.id) {
        events.push(...closeFormerAnswer(previous.answer, step));
        continue;
      }
      events.push(...openStep(step, closings));
      continue;
    }
    before.delete(step.id);
    events.push(...progressStep(was, step, closings));
  }
  for (const [id, was] of before) {
    const reopened = was.kind === 'message' && next.answer?.id === id;
    throw new AgUiTranslationGap(reopened ? 'answer_reopened' : 'withdrawn', was.kind);
  }
  return events;
}

function closeFormerAnswer(answer: ObservedMessage, step: ObservedStep): AgUiEvent[] {
  const text = step.text ?? '';
  if (!text.startsWith(answer.text)) throw new AgUiTranslationGap('answer_not_prefix', 'answer');
  const delta = text.slice(answer.text.length);
  const events: AgUiEvent[] = [];
  if (delta !== '')
    events.push({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: step.id,
      delta,
      ...stamp(step.finishedAt),
    });
  events.push(endMessage(step.id, step.finishedAt));
  return events;
}

/**
 * The new text of a growing step. Text that does not continue the sent one, or that grows on a
 * step whose end was already sent (after its TEXT_MESSAGE_END or REASONING_END), is a gap: the
 * projection continues late text as a new step, so this only guards the log's truthfulness.
 */
function grownText(was: ObservedStep, step: ObservedStep): string {
  const before = was.text ?? '';
  const after = step.text ?? '';
  if (!after.startsWith(before)) throw new AgUiTranslationGap('text_not_prefix', step.kind);
  const delta = after.slice(before.length);
  if (delta !== '' && was.status !== 'running')
    throw new AgUiTranslationGap('text_after_close', step.kind);
  return delta;
}

function progressStep(was: ObservedStep, step: ObservedStep, closings: AgUiEvent[]): AgUiEvent[] {
  if (was.kind !== step.kind || was.parentId !== step.parentId)
    throw new AgUiTranslationGap('reshaped', was.kind);
  if (regressed(was.status, step.status)) throw new AgUiTranslationGap('regressed', step.kind);
  const changed = was.status === 'running' && step.status !== 'running';
  switch (step.kind) {
    case 'message': {
      const delta = grownText(was, step);
      if (was.status !== 'running') return [];
      const events: AgUiEvent[] = delta === '' ? [] : [narrationDelta(step, delta)];
      if (changed) events.push(endNarration(step));
      return events;
    }
    case 'reasoning': {
      const delta = grownText(was, step);
      if (was.status !== 'running') return [];
      const events: AgUiEvent[] = [];
      if (delta !== '')
        events.push(
          ...((was.text ?? '') === '' ? reasoningText(step, delta) : [reasoningDelta(step, delta)]),
        );
      if (changed) events.push(...endReasoning(step));
      return events;
    }
    case 'generation':
      return [];
    case 'tool':
      return changed ? [toolResult(step)] : [];
    case 'delegation':
    case 'subagent': {
      const events: AgUiEvent[] = [];
      const subagentWas = was.subagentStatus;
      const subagentNow = step.subagentStatus;
      if (subagentWas !== undefined && subagentNow === undefined)
        throw new AgUiTranslationGap('subagent_withdrawn', step.kind);
      if (
        subagentWas !== undefined &&
        subagentNow !== undefined &&
        regressed(subagentWas, subagentNow)
      )
        throw new AgUiTranslationGap('subagent_regressed', step.kind);
      if (subagentWas === undefined && subagentNow !== undefined)
        events.push(subagentStarted(step));
      if (subagentNow !== undefined && subagentNow !== 'running' && subagentWas !== subagentNow)
        closings.push(subagentEnded(step, subagentNow));
      if (step.kind === 'delegation' && changed) {
        if (subagentNow === undefined) events.push(toolResult(step));
        else closings.push(toolResult(step));
      }
      return events;
    }
  }
}

function regressed(was: string, now: string): boolean {
  return (RANK[now] ?? 0) < (RANK[was] ?? 0) || (was !== 'running' && was !== now);
}

function progressAnswer(previous: ObservedView, next: ObservedView): AgUiEvent[] {
  if (next.answer === null) {
    if (previous.answer === null) return [];
    throw new AgUiTranslationGap('answer_withdrawn', 'answer');
  }
  if (previous.answer === null) return openMessage(next.answer);
  if (previous.answer.id !== next.answer.id) {
    // The former answer is now a narration step, closed by progressSteps; open the new one.
    if (!next.steps.some((step) => step.id === previous.answer?.id))
      throw new AgUiTranslationGap('answer_replaced', 'answer');
    return openMessage(next.answer);
  }
  if (!next.answer.text.startsWith(previous.answer.text))
    throw new AgUiTranslationGap('answer_not_prefix', 'answer');
  const delta = next.answer.text.slice(previous.answer.text.length);
  return delta === ''
    ? []
    : [
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: next.answer.id,
          delta,
          ...stamp(next.answer.finishedAt),
        },
      ];
}

function finish(
  execution: Execution,
  run: { threadId: string; runId: string },
  answer: ObservedMessage | null,
): AgUiEvent {
  const at = stamp(
    execution.finishedAt === null ? answer?.finishedAt : Date.parse(execution.finishedAt),
  );
  if (RUN_ERROR_STATUSES.has(execution.status)) {
    return {
      type: EventType.RUN_ERROR,
      message: execution.error ?? 'Runtime execution failed.',
      code: execution.errorCode ?? execution.status,
      ...at,
    };
  }
  return execution.status === 'completed'
    ? { type: EventType.RUN_FINISHED, ...run, outcome: { type: 'success' }, ...at }
    : { type: EventType.RUN_FINISHED, ...run, ...at };
}

export function isAgUiEvent(value: unknown): value is BaseEvent {
  return typeof value === 'object' && value !== null && 'type' in value;
}
