import { EXECUTION_REASONING_MAX_LENGTH } from '@alfred/contracts';
import { PROJECTION_LIMITS } from './runtime-projection-data';
import {
  CHILD_TEXT_MAX_LENGTH,
  hasStepRoom,
  omitStep,
  ownerEnded,
  pushStep,
  reasoningProjectionId,
  segmentProjectionId,
  type ProjectionChildMessage,
  type ProjectionReasoning,
  type StepState,
} from './runtime-projection-steps';

interface Appended {
  readonly text: string;
  readonly bytes: number;
  readonly truncated: boolean;
}

/**
 * Appends content within its own bound and the shared budget; what does not fit is dropped. The
 * text bound is a JavaScript string length (UTF-16 code units, what the contract and the browser
 * check) and the budget counts UTF-8 bytes: both are enforced separately, whole code points only.
 */
function appendContent(state: StepState, current: string, delta: string, limit: number): Appended {
  const units = Math.max(0, limit - current.length);
  const budget = Math.max(0, PROJECTION_LIMITS.contentBytes - state.contentBytes);
  let length = 0;
  let bytes = 0;
  for (const codePoint of delta) {
    const size = Buffer.byteLength(codePoint, 'utf8');
    if (length + codePoint.length > units || bytes + size > budget) break;
    length += codePoint.length;
    bytes += size;
  }
  return {
    text: current + delta.slice(0, length),
    bytes,
    truncated: length < delta.length,
  };
}

/** The invocation a recorded step belongs to; undefined for the orchestrator's own steps. */
function ownerOf(state: StepState, id: string): string | undefined {
  return (state.reasoning[id] ?? state.childMessages[id] ?? state.activities[id])?.subagentId;
}

/**
 * True when a step of the same owner was recorded after `id` (the message's own round trip
 * aside). The work log reports a text step as still running only when no later step of its owner
 * is reported, which implies this is false: text is only ever appended to a step an observer may
 * still see open, and a step it saw closed never grows (ALF-DEC-006 §5).
 */
function followed(
  state: StepState,
  id: string,
  owner: string | undefined,
  ownMessage: string,
): boolean {
  for (let index = state.order.length - 1; index >= 0; index -= 1) {
    const later = state.order[index];
    if (later === id) return false;
    if (later === undefined || later === ownMessage) continue;
    if (ownerOf(state, later) === owner) return true;
  }
  return false;
}

/**
 * A reasoning chunk of a message: the marker records when and how long; its text only when the
 * caller exposes content (`text` null keeps the presence alone). Reasoning that resumes once the
 * message produced output, or once its owner recorded another step, becomes a continuation marker
 * placed after that step, so the work log reads in the order things happened. `produced` tells
 * whether the message already has words or tool calls. Text for a finished invocation is dropped.
 */
export function noteReasoning<S extends StepState>(
  state: S,
  invocationId: string,
  messageId: string,
  at: number,
  text: string | null,
  subagentId: string | undefined,
  produced: boolean,
): S {
  if (ownerEnded(state, subagentId)) return state;
  const baseId = reasoningProjectionId(invocationId, messageId);
  const base = state.reasoning[baseId];
  if (base === undefined) {
    if (!hasStepRoom(state)) return omitStep(state, baseId);
    return openReasoning(state, baseId, messageId, at, text ?? '', subagentId, undefined);
  }
  const latestId =
    base.segments === undefined
      ? baseId
      : segmentProjectionId(invocationId, 'reasoning', messageId, base.segments);
  const latest = state.reasoning[latestId] ?? base;
  const open =
    (latest.segment !== undefined || !produced) &&
    !followed(state, latest.id, subagentId, messageId);
  if (text === null || text === '' || open) return appendReasoning(state, latest, at, text);
  const segment = (base.segments ?? 0) + 1;
  if (!hasStepRoom(state) || appendContent(state, '', text, 2).text === '')
    return appendReasoning(state, latest, at, null);
  const counted: S = {
    ...state,
    reasoning: { ...state.reasoning, [baseId]: { ...base, segments: segment } },
  };
  return openReasoning(
    counted,
    segmentProjectionId(invocationId, 'reasoning', messageId, segment),
    messageId,
    at,
    text,
    subagentId,
    segment,
  );
}

function openReasoning<S extends StepState>(
  state: S,
  id: string,
  messageId: string,
  at: number,
  text: string,
  subagentId: string | undefined,
  segment: number | undefined,
): S {
  const appended = appendContent(state, '', text, EXECUTION_REASONING_MAX_LENGTH);
  const marker: ProjectionReasoning = {
    id,
    messageId,
    startedAt: at,
    finishedAt: at,
    chunks: 1,
    text: appended.text,
    ...(subagentId === undefined ? {} : { subagentId }),
    ...(appended.truncated ? { truncated: true } : {}),
    ...(segment === undefined ? {} : { segment }),
  };
  return pushStep(
    {
      ...state,
      reasoning: { ...state.reasoning, [id]: marker },
      contentBytes: state.contentBytes + appended.bytes,
    },
    id,
  );
}

function appendReasoning<S extends StepState>(
  state: S,
  existing: ProjectionReasoning,
  at: number,
  text: string | null,
): S {
  const appended =
    text === null
      ? { text: existing.text, bytes: 0, truncated: false }
      : appendContent(state, existing.text, text, EXECUTION_REASONING_MAX_LENGTH);
  const marker: ProjectionReasoning = {
    ...existing,
    finishedAt: Math.max(existing.finishedAt, at),
    chunks: existing.chunks + 1,
    text: appended.text,
    ...(existing.truncated === true || appended.truncated ? { truncated: true } : {}),
  };
  return {
    ...state,
    reasoning: { ...state.reasoning, [existing.id]: marker },
    contentBytes: state.contentBytes + appended.bytes,
  };
}

/**
 * A specialist's intermediate message text, appended (tuple) or replaced (cumulative, where only
 * a tail that extends the recorded text counts). Text that resumes after the invocation recorded
 * another step (typically the message's own tool call) continues as a new part after that step.
 */
export function noteChildText<S extends StepState>(
  state: S,
  invocationId: string,
  messageId: string,
  subagentId: string,
  text: string,
  mode: 'tuple' | 'cumulative',
  at: number,
): S {
  if (ownerEnded(state, subagentId)) return state;
  const base = state.childMessages[messageId];
  if (base === undefined) {
    if (!hasStepRoom(state)) return omitStep(state, messageId);
    return openChild(state, messageId, messageId, subagentId, text, at, undefined);
  }
  const parts = [
    base,
    ...Array.from({ length: base.segments ?? 0 }, (_, index) =>
      segmentProjectionId(invocationId, 'message', messageId, index + 1),
    ).flatMap((id) => state.childMessages[id] ?? []),
  ];
  const latest = parts.at(-1) ?? base;
  const whole = parts.map((part) => part.text).join('');
  const delta = mode === 'tuple' ? text : text.startsWith(whole) ? text.slice(whole.length) : '';
  if (delta === '' || !followed(state, latest.id, subagentId, messageId))
    return appendChild(state, latest, delta, at);
  const segment = (base.segments ?? 0) + 1;
  if (!hasStepRoom(state) || appendContent(state, '', delta, 2).text === '')
    return appendChild(state, latest, '', at);
  const counted: S = {
    ...state,
    childMessages: { ...state.childMessages, [messageId]: { ...base, segments: segment } },
  };
  return openChild(
    counted,
    segmentProjectionId(invocationId, 'message', messageId, segment),
    messageId,
    subagentId,
    delta,
    at,
    segment,
  );
}

function openChild<S extends StepState>(
  state: S,
  id: string,
  messageId: string,
  subagentId: string,
  text: string,
  at: number,
  segment: number | undefined,
): S {
  const appended = appendContent(state, '', text, CHILD_TEXT_MAX_LENGTH);
  const message: ProjectionChildMessage = {
    id,
    subagentId,
    text: appended.text,
    startedAt: at,
    finishedAt: at,
    ...(appended.truncated ? { truncated: true } : {}),
    ...(segment === undefined ? {} : { messageId, segment }),
  };
  return pushStep(
    {
      ...state,
      childMessages: { ...state.childMessages, [id]: message },
      contentBytes: state.contentBytes + appended.bytes,
    },
    id,
  );
}

function appendChild<S extends StepState>(
  state: S,
  existing: ProjectionChildMessage,
  delta: string,
  at: number,
): S {
  const appended = appendContent(state, existing.text, delta, CHILD_TEXT_MAX_LENGTH);
  const message: ProjectionChildMessage = {
    ...existing,
    text: appended.text,
    finishedAt: Math.max(existing.finishedAt, at),
    ...(existing.truncated === true || appended.truncated ? { truncated: true } : {}),
  };
  return {
    ...state,
    childMessages: { ...state.childMessages, [existing.id]: message },
    contentBytes: state.contentBytes + appended.bytes,
  };
}
