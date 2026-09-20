import type * as Contracts from '@alfred/contracts';
import type { ExecutionActivity, ExecutionSnapshot, WorkStep } from '@alfred/contracts';
import { EventType } from '@ag-ui/core';

import type { AlfredAgUiEvent } from '../../src/lib/workspace/ag-ui-events';

/**
 * The contracts value, kept literal: Playwright loads this helper through Node's CommonJS path,
 * which cannot load the zod-based contracts at runtime. The type pins it to the contract.
 */
const EXECUTION_WORK_OMITTED_EVENT: typeof Contracts.EXECUTION_WORK_OMITTED_EVENT =
  'alfred.work.omitted';

/** One AG-UI event as the API frames it: the cursor of the frame travels as the SSE `id`. */
export interface AgUiFrame {
  readonly event: AlfredAgUiEvent;
  readonly id?: string;
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'timed_out']);
const RUN_ERROR = new Set(['failed', 'timed_out', 'recovery_required', 'interrupted']);

const settled = (snapshot: ExecutionSnapshot) =>
  TERMINAL.has(snapshot.execution.status) || snapshot.execution.finishedAt !== null;
export const answerMessageId = (snapshot: ExecutionSnapshot) => `${snapshot.execution.id}:answer`;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const stamp = (ms: number | null | undefined) =>
  typeof ms === 'number' && ms > 0 ? { timestamp: ms } : {};

function toolEvents(message: string, tool: ExecutionActivity, opened: boolean): AlfredAgUiEvent[] {
  const events: AlfredAgUiEvent[] = opened
    ? []
    : [
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: tool.id,
          toolCallName: tool.label,
          parentMessageId: message,
        },
        { type: EventType.TOOL_CALL_END, toolCallId: tool.id },
      ];
  if (tool.status !== 'running')
    events.push({
      type: EventType.TOOL_CALL_RESULT,
      messageId: `${tool.id}:result`,
      toolCallId: tool.id,
      content: tool.status,
      role: 'tool',
    });
  return events;
}

const owner = (step: WorkStep) =>
  step.parentId === undefined ? {} : { subagentRunId: step.parentId };

function stepResult(step: WorkStep): AlfredAgUiEvent {
  return {
    type: EventType.TOOL_CALL_RESULT,
    messageId: `${step.id}:result`,
    toolCallId: step.id,
    // Only settled steps get a result; a running one would never be asked for it.
    content: step.status === 'running' ? 'completed' : step.status,
    role: 'tool',
    ...owner(step),
    ...stamp(step.finishedAt),
  };
}

function subagentEnd(step: WorkStep): AlfredAgUiEvent {
  return step.subagentStatus === 'completed'
    ? {
        type: EventType.SUBAGENT_FINISHED,
        subagentRunId: step.id,
        outcome: { type: 'success' },
        ...stamp(step.finishedAt),
      }
    : {
        type: EventType.SUBAGENT_ERROR,
        subagentRunId: step.id,
        message:
          step.subagentStatus === 'interrupted'
            ? 'The specialist was interrupted.'
            : 'The specialist could not complete its task.',
        code: step.subagentStatus ?? 'failed',
        ...stamp(step.finishedAt),
      };
}

function messageEvents(step: WorkStep): AlfredAgUiEvent[] {
  const events: AlfredAgUiEvent[] = [
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
      ...stamp(step.finishedAt),
    });
  if (step.status !== 'running')
    events.push({
      type: EventType.TEXT_MESSAGE_END,
      messageId: step.id,
      ...owner(step),
      ...stamp(step.finishedAt),
    });
  return events;
}

function reasoningEvents(step: WorkStep): AlfredAgUiEvent[] {
  const events: AlfredAgUiEvent[] = [
    {
      type: EventType.REASONING_START,
      messageId: step.id,
      ...owner(step),
      ...stamp(step.startedAt),
    },
  ];
  if (step.text !== undefined && step.text !== '')
    events.push(
      {
        type: EventType.REASONING_MESSAGE_START,
        messageId: step.id,
        role: 'reasoning',
        ...owner(step),
        ...stamp(step.startedAt),
      },
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: step.id,
        delta: step.text,
        ...owner(step),
        ...stamp(step.finishedAt),
      },
    );
  if (step.status !== 'running') events.push(...reasoningEnd(step));
  return events;
}

function reasoningEnd(step: WorkStep): AlfredAgUiEvent[] {
  const events: AlfredAgUiEvent[] = [];
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

/** Mirrors the API's opening of one work step; specialist outcomes are deferred to `closings`. */
function openStep(step: WorkStep, closings: AlfredAgUiEvent[]): AlfredAgUiEvent[] {
  switch (step.kind) {
    case 'message':
      return messageEvents(step);
    case 'reasoning':
      return reasoningEvents(step);
    case 'generation':
      return [
        { type: EventType.STEP_STARTED, stepName: step.id, ...stamp(step.startedAt) },
        { type: EventType.STEP_FINISHED, stepName: step.id, ...stamp(step.finishedAt) },
      ];
    case 'tool':
      return [
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: step.id,
          toolCallName: step.label,
          ...owner(step),
          ...stamp(step.startedAt),
        },
        {
          type: EventType.TOOL_CALL_END,
          toolCallId: step.id,
          ...owner(step),
          ...stamp(step.startedAt),
        },
        ...(step.status === 'running' ? [] : [stepResult(step)]),
      ];
    case 'delegation': {
      const events: AlfredAgUiEvent[] = [
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: step.id,
          toolCallName: step.label,
          ...stamp(step.startedAt),
        },
        { type: EventType.TOOL_CALL_END, toolCallId: step.id, ...stamp(step.startedAt) },
      ];
      if (step.subagentStatus !== undefined) {
        events.push({
          type: EventType.SUBAGENT_STARTED,
          subagentRunId: step.id,
          name: step.specialist ?? 'specialist',
          parentToolCallId: step.id,
          ...stamp(step.startedAt),
        });
        if (step.subagentStatus !== 'running') closings.push(subagentEnd(step));
        if (step.status !== 'running') closings.push(stepResult(step));
      } else if (step.status !== 'running') events.push(stepResult(step));
      return events;
    }
    case 'subagent':
      if (step.status !== 'running') closings.push(subagentEnd(step));
      return [
        {
          type: EventType.SUBAGENT_STARTED,
          subagentRunId: step.id,
          name: step.specialist ?? 'specialist',
          ...stamp(step.startedAt),
        },
      ];
  }
}

/** The new tail of a growing text step; test snapshots must extend what they sent. */
function grownText(was: WorkStep, step: WorkStep): string {
  const before = was.text ?? '';
  const after = step.text ?? '';
  if (!after.startsWith(before)) throw new Error('Test steps must extend the previous text');
  return after.slice(before.length);
}

function progressStep(
  was: WorkStep,
  step: WorkStep,
  closings: AlfredAgUiEvent[],
): AlfredAgUiEvent[] {
  const changed = was.status === 'running' && step.status !== 'running';
  if (step.kind === 'message') {
    const delta = grownText(was, step);
    if (was.status !== 'running') return [];
    const events: AlfredAgUiEvent[] =
      delta === ''
        ? []
        : [
            {
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId: step.id,
              delta,
              ...owner(step),
              ...stamp(step.finishedAt),
            },
          ];
    if (changed)
      events.push({
        type: EventType.TEXT_MESSAGE_END,
        messageId: step.id,
        ...owner(step),
        ...stamp(step.finishedAt),
      });
    return events;
  }
  if (step.kind === 'reasoning') {
    const delta = grownText(was, step);
    const events: AlfredAgUiEvent[] = [];
    if (delta !== '') {
      if ((was.text ?? '') === '')
        events.push({
          type: EventType.REASONING_MESSAGE_START,
          messageId: step.id,
          role: 'reasoning',
          ...owner(step),
          ...stamp(step.startedAt),
        });
      events.push({
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: step.id,
        delta,
        ...owner(step),
        ...stamp(step.finishedAt),
      });
    }
    if (changed) events.push(...reasoningEnd(step));
    return events;
  }
  if (step.kind === 'generation') return [];
  if (step.kind === 'tool') return changed ? [stepResult(step)] : [];
  const events: AlfredAgUiEvent[] = [];
  if (was.subagentStatus === undefined && step.subagentStatus !== undefined)
    events.push({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: step.id,
      name: step.specialist ?? 'specialist',
      ...(step.kind === 'delegation' ? { parentToolCallId: step.id } : {}),
      ...stamp(step.startedAt),
    });
  if (
    step.subagentStatus !== undefined &&
    step.subagentStatus !== 'running' &&
    was.subagentStatus !== step.subagentStatus
  )
    closings.push(subagentEnd(step));
  if (step.kind === 'delegation' && changed) {
    if (step.subagentStatus === undefined) events.push(stepResult(step));
    else closings.push(stepResult(step));
  }
  return events;
}

/** The work log events between two snapshots; snapshots without `work` use `activities`. */
function workEvents(
  previous: ExecutionSnapshot | null,
  next: ExecutionSnapshot,
): AlfredAgUiEvent[] {
  if (next.work === undefined) return [];
  const before = new Map((previous?.work?.steps ?? []).map((step) => [step.id, step]));
  const events: AlfredAgUiEvent[] = [];
  const closings: AlfredAgUiEvent[] = [];
  for (const step of next.work.steps) {
    const was = before.get(step.id);
    events.push(
      ...(was === undefined ? openStep(step, closings) : progressStep(was, step, closings)),
    );
  }
  return [...events, ...closings];
}

/**
 * Mirrors the API translator (`ag-ui-translation.ts`): the AG-UI events that bring an observer
 * from `previous` (null on attach) to `next`. Tests describe executions as cumulative public
 * snapshots and let this helper produce the wire sequence. A snapshot carrying `work` describes
 * its tools through the work log; one without it describes them through `activities`.
 */
export function synthesizeFrames(
  previous: ExecutionSnapshot | null,
  next: ExecutionSnapshot,
): AgUiFrame[] {
  const events: AlfredAgUiEvent[] = [];
  const message = answerMessageId(next);
  const run = { threadId: next.execution.conversationId, runId: next.execution.id };
  const state = {
    execution: next.execution,
    conversation: next.conversation,
    userMessage: next.userMessage,
  };
  const hadMessage = previous !== null && previous.assistantText !== '';
  const hasMessage = next.assistantText !== '' || hadMessage;
  const throughWork = next.work !== undefined;
  if (previous === null) {
    events.push({ type: EventType.RUN_STARTED, ...run });
    events.push({ type: EventType.STATE_SNAPSHOT, snapshot: state });
    if (!throughWork)
      for (const tool of next.activities) events.push(...toolEvents(message, tool, false));
    events.push(...workEvents(null, next));
    if ((next.work?.omittedSteps ?? 0) > 0) events.push(omitted(next));
    if (hasMessage) {
      events.push({ type: EventType.TEXT_MESSAGE_START, messageId: message, role: 'assistant' });
      if (next.assistantText !== '')
        events.push({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: message,
          delta: next.assistantText,
        });
    }
  } else {
    const previousState = {
      execution: previous.execution,
      conversation: previous.conversation,
      userMessage: previous.userMessage,
    };
    if (!same(previousState, state))
      events.push({ type: EventType.STATE_SNAPSHOT, snapshot: state });
    if (!throughWork)
      for (const tool of next.activities) {
        const before = previous.activities.find((item) => item.id === tool.id);
        if (before === undefined) events.push(...toolEvents(message, tool, false));
        else if (before.status !== tool.status) events.push(...toolEvents(message, tool, true));
      }
    events.push(...workEvents(previous, next));
    if ((next.work?.omittedSteps ?? 0) !== (previous.work?.omittedSteps ?? 0))
      events.push(omitted(next));
    if (!next.assistantText.startsWith(previous.assistantText))
      throw new Error('Test snapshots must extend the previous answer text');
    const delta = next.assistantText.slice(previous.assistantText.length);
    if (!hadMessage && hasMessage)
      events.push({ type: EventType.TEXT_MESSAGE_START, messageId: message, role: 'assistant' });
    if (delta !== '')
      events.push({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: message, delta });
  }
  if (settled(next)) {
    if (hasMessage) events.push({ type: EventType.TEXT_MESSAGE_END, messageId: message });
    if (RUN_ERROR.has(next.execution.status))
      events.push({
        type: EventType.RUN_ERROR,
        message: next.execution.error ?? 'Runtime execution failed.',
        code: next.execution.errorCode ?? next.execution.status,
      });
    else if (next.execution.status === 'completed')
      events.push({ type: EventType.RUN_FINISHED, ...run, outcome: { type: 'success' } });
    else events.push({ type: EventType.RUN_FINISHED, ...run });
  }
  return events.map((event, index) =>
    index === events.length - 1 && next.cursor !== null ? { event, id: next.cursor } : { event },
  );
}

/** Mirrors the API: the omitted step count travels as the profile's one custom event. */
function omitted(snapshot: ExecutionSnapshot): AlfredAgUiEvent {
  return {
    type: EventType.CUSTOM,
    name: EXECUTION_WORK_OMITTED_EVENT,
    value: { omittedSteps: snapshot.work?.omittedSteps ?? 0 },
  };
}

/** One batch per snapshot: attach for the first, then the frames of every transition. */
export function synthesizeRun(snapshots: readonly ExecutionSnapshot[]): AgUiFrame[][] {
  const batches: AgUiFrame[][] = [];
  let previous: ExecutionSnapshot | null = null;
  for (const snapshot of snapshots) {
    batches.push(synthesizeFrames(previous, snapshot));
    previous = snapshot;
  }
  return batches;
}

/** Wire encoding of the API: unnamed `data:` frames, the cursor as `id:` on the last one. */
export function encodeAgUiFrames(frames: readonly AgUiFrame[]): string {
  return frames
    .map(
      ({ event, id }) =>
        `${id === undefined ? '' : `id: ${id}\n`}data: ${JSON.stringify(event)}\n\n`,
    )
    .join('');
}

/** The diagnostics view of the same frames, as the browser files them under their execution. */
export function diagnosticEvents(frames: readonly AgUiFrame[], executionId: string) {
  return frames.map((frame, index) => ({
    id: index + 1,
    executionId,
    event: frame.event.type,
    data: frame.event,
  }));
}
