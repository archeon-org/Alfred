import { createHash } from 'node:crypto';

import { PROJECTION_LIMITS, ProjectionError, projectionId } from './runtime-projection-data';

/** Outcome of a tool call, delegation or specialist invocation as the reducer records it. */
export type ActivityStatus = 'running' | 'completed' | 'failed' | 'interrupted';

export interface ProjectionActivity {
  readonly id: string;
  readonly label: string;
  readonly status: ActivityStatus;
}

/** One tool call. A `delegation` is the runtime's delegation tool invoking a specialist. */
export interface StoredActivity extends ProjectionActivity {
  readonly messageId: string;
  readonly kind: 'tool' | 'delegation';
  readonly startedAt: number;
  readonly finishedAt?: number;
  /** Delegation: the specialist requested; known from the complete tool call arguments. */
  readonly specialist?: string;
  /** Delegation: the specialist invocation it started; tool: the invocation it belongs to. */
  readonly subagentId?: string;
  /** Delegation: whether the invocation link was inferred or confirmed by the runtime. */
  readonly link?: 'guess' | 'exact';
}

/** One specialist invocation, identified by the private namespace of its sub-graph. */
export interface ProjectionSubagent {
  readonly id: string;
  readonly name: string | null;
  readonly delegationId: string | null;
  readonly status: ActivityStatus;
  readonly startedAt: number;
  readonly finishedAt?: number;
}

export interface ProjectionTiming {
  readonly startedAt: number;
  readonly finishedAt: number;
}

/** Hidden reasoning observed for a message: when, for how long, and its text when exposed. */
export interface ProjectionReasoning {
  readonly id: string;
  readonly messageId: string;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly chunks: number;
  readonly text: string;
  /** The specialist invocation it belongs to; absent for the orchestrator's own reasoning. */
  readonly subagentId?: string;
  readonly truncated?: true;
  /** First marker of a message: how many continuations followed it. */
  readonly segments?: number;
  /** Continuation: reasoning that resumed after a later step of its owner was recorded. */
  readonly segment?: number;
}

/** An intermediate message of a specialist, kept when the deployment exposes work content. */
export interface ProjectionChildMessage {
  readonly id: string;
  readonly subagentId: string;
  readonly text: string;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly truncated?: true;
  /** First part of a message: how many continuations followed it. */
  readonly segments?: number;
  /** Continuation: the message the text belongs to, when it resumed after a later step. */
  readonly messageId?: string;
  readonly segment?: number;
}

/** The part of the projection that the step bookkeeping reads and writes. */
export interface StepState {
  readonly activities: Readonly<Record<string, StoredActivity>>;
  readonly subagents: Readonly<Record<string, ProjectionSubagent>>;
  readonly reasoning: Readonly<Record<string, ProjectionReasoning>>;
  readonly childMessages: Readonly<Record<string, ProjectionChildMessage>>;
  readonly order: readonly string[];
  readonly omittedSteps: number;
  /** Short digests of the omitted steps already counted, so each counts once (bounded). */
  readonly omittedIds?: readonly string[];
  /** Bytes of reasoning and specialist text recorded so far, against a shared budget. */
  readonly contentBytes: number;
}

/** Text of one specialist message kept in the reducer (the JSON profile bounds it further). */
export const CHILD_TEXT_MAX_LENGTH = 8_000;

export function subagentProjectionId(invocationId: string, namespace: string): string {
  return projectionId(invocationId, 'subagent', namespace);
}

export function reasoningProjectionId(invocationId: string, messageId: string): string {
  return projectionId(invocationId, 'reasoning', messageId);
}

/** Continuation `segment` (1, 2, …) of a reasoning marker or of a specialist's message. */
export function segmentProjectionId(
  invocationId: string,
  kind: 'reasoning' | 'message',
  messageId: string,
  segment: number,
): string {
  return projectionId(invocationId, `${kind}-segment`, `${messageId}:${segment}`);
}

export function hasStepRoom(state: StepState): boolean {
  return state.order.length < PROJECTION_LIMITS.steps;
}

/** Omitted steps remembered by digest; past this many, a further omission may count again. */
export const OMITTED_MEMO_LIMIT = 2_048;

function omissionKey(id: string): string {
  return createHash('sha256').update(id).digest('base64url').slice(0, 16);
}

/**
 * Counts a step that the bound keeps out of the log, once: later chunks, deltas or the complete
 * message of the same step never count it again, whatever the streaming split.
 */
export function omitStep<S extends StepState>(state: S, id: string): S {
  const memo = state.omittedIds ?? [];
  const key = omissionKey(id);
  if (memo.includes(key)) return state;
  return {
    ...state,
    omittedSteps: state.omittedSteps + 1,
    ...(memo.length < OMITTED_MEMO_LIMIT ? { omittedIds: [...memo, key] } : {}),
  };
}

/** Records one more step in order, or counts it once the bound is reached. */
export function pushStep<S extends StepState>(state: S, id: string): S {
  if (state.order.includes(id)) return state;
  return hasStepRoom(state) ? { ...state, order: [...state.order, id] } : omitStep(state, id);
}

/** Whether a step's specialist invocation already ended: nothing more is recorded for it. */
export function ownerEnded(state: StepState, subagentId: string | undefined): boolean {
  if (subagentId === undefined) return false;
  const subagent = state.subagents[subagentId];
  return subagent !== undefined && subagent.status !== 'running';
}

/** True once a message has words or tool calls of its own: its first reasoning is behind it. */
export function produced(
  state: StepState & { readonly texts: Readonly<Record<string, string>> },
  messageId: string,
): boolean {
  return (
    Object.hasOwn(state.texts, messageId) ||
    Object.hasOwn(state.childMessages, messageId) ||
    Object.values(state.activities).some((activity) => activity.messageId === messageId)
  );
}

/** Whether any step of the message is recorded (words, markers, tool calls). */
export function hasMessageSteps(
  state: StepState,
  invocationId: string,
  messageId: string,
): boolean {
  return (
    Object.hasOwn(state.childMessages, messageId) ||
    Object.hasOwn(state.reasoning, reasoningProjectionId(invocationId, messageId)) ||
    Object.values(state.activities).some((activity) => activity.messageId === messageId)
  );
}

/** Removes every step of an excluded message; subagents keep their own lifecycle. */
export function dropMessageSteps<S extends StepState>(
  state: S,
  invocationId: string,
  messageId: string,
): S {
  const removed = new Set<string>([reasoningProjectionId(invocationId, messageId)]);
  const activities = Object.fromEntries(
    Object.entries(state.activities).filter(([id, activity]) => {
      if (activity.messageId !== messageId) return true;
      removed.add(id);
      return false;
    }),
  );
  const reasoning = Object.fromEntries(
    Object.entries(state.reasoning).filter(([id, marker]) => {
      if (marker.messageId !== messageId) return true;
      removed.add(id);
      return false;
    }),
  );
  const childMessages = Object.fromEntries(
    Object.entries(state.childMessages).filter(([id, child]) => {
      if (id !== messageId && child.messageId !== messageId) return true;
      removed.add(id);
      return false;
    }),
  );
  return {
    ...state,
    activities,
    reasoning,
    childMessages,
    order: state.order.filter((id) => id !== messageId && !removed.has(id)),
  };
}

export function assertStepLimits(state: StepState): void {
  if (
    !Array.isArray(state.order) ||
    state.order.length > PROJECTION_LIMITS.steps ||
    Object.keys(state.activities).length > PROJECTION_LIMITS.steps ||
    Object.keys(state.subagents).length > PROJECTION_LIMITS.steps ||
    Object.keys(state.reasoning).length > PROJECTION_LIMITS.steps ||
    Object.keys(state.childMessages).length > PROJECTION_LIMITS.steps ||
    !Number.isSafeInteger(state.omittedSteps) ||
    state.omittedSteps < 0 ||
    (state.omittedIds !== undefined &&
      (!Array.isArray(state.omittedIds) ||
        state.omittedIds.length > OMITTED_MEMO_LIMIT ||
        state.omittedIds.some((key) => typeof key !== 'string' || key.length !== 16))) ||
    !Number.isSafeInteger(state.contentBytes) ||
    state.contentBytes < 0 ||
    state.contentBytes > PROJECTION_LIMITS.contentBytes
  )
    throw new ProjectionError('runtime_projection_limit');
}
