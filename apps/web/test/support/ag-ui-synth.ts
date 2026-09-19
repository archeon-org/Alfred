import type { ExecutionActivity, ExecutionSnapshot } from '@alfred/contracts';
import { EventType } from '@ag-ui/core';

import type { AlfredAgUiEvent } from '../../src/lib/workspace/ag-ui-events';

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

/**
 * Mirrors the API translator (`ag-ui-translation.ts`): the AG-UI events that bring an observer
 * from `previous` (null on attach) to `next`. Tests describe executions as cumulative public
 * snapshots and let this helper produce the wire sequence.
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
  if (previous === null) {
    events.push({ type: EventType.RUN_STARTED, ...run });
    events.push({ type: EventType.STATE_SNAPSHOT, snapshot: state });
    for (const tool of next.activities) events.push(...toolEvents(message, tool, false));
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
    for (const tool of next.activities) {
      const before = previous.activities.find((item) => item.id === tool.id);
      if (before === undefined) events.push(...toolEvents(message, tool, false));
      else if (before.status !== tool.status) events.push(...toolEvents(message, tool, true));
    }
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

/** The diagnostics view of the same frames, as the browser records them. */
export function diagnosticEvents(frames: readonly AgUiFrame[]) {
  return frames.map((frame, index) => ({
    id: index + 1,
    event: frame.event.type,
    data: frame.event,
  }));
}
