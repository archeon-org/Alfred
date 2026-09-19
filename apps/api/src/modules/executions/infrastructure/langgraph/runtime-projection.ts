import {
  assertBounded,
  containsInterrupt,
  DELEGATION_TOOL,
  eventNamespace,
  nativeEventTimestamp,
  nativeEventType,
  PROJECTION_LIMITS,
  ProjectionError,
  projectionId,
  record,
  requireRecord,
  runtimeEventDigest,
  validId,
} from './runtime-projection-data';
import {
  applyMessage,
  applyMessages,
  classify,
  noteRootUpdate,
  type EventContext,
} from './runtime-projection-messages';
import { ensureSubagent } from './runtime-projection-links';
import {
  assertStepLimits,
  type ProjectionActivity,
  type ProjectionChildMessage,
  type ProjectionReasoning,
  type ProjectionSubagent,
  type ProjectionTiming,
  type StoredActivity,
} from './runtime-projection-steps';

export { PROJECTION_LIMITS, ProjectionError } from './runtime-projection-data';
export type {
  ActivityStatus,
  ProjectionActivity,
  ProjectionChildMessage,
  ProjectionReasoning,
  ProjectionSubagent,
  ProjectionTiming,
  StoredActivity,
} from './runtime-projection-steps';

export interface ProjectionState {
  readonly version: 2;
  readonly sequence: number;
  readonly sourceId: string | null;
  readonly invocationId: string | null;
  readonly texts: Readonly<Record<string, string>>;
  readonly excluded: readonly string[];
  /** Native source watermark. Persist atomically with this reducer and its public projection. */
  readonly lastId: string | null;
  /** Fingerprint of the last source event; a reused cursor must identify identical content. */
  readonly lastEventDigest: string | null;
  readonly activities: Readonly<Record<string, StoredActivity>>;
  readonly visibility: Readonly<Record<string, 'allowed' | 'pending'>>;
  readonly modes: Readonly<Record<string, 'tuple' | 'cumulative'>>;
  readonly messageOrder: readonly string[];
  /** Text from a namespaced sub-graph was seen; it never becomes the answer (ALF-DEC-037). */
  readonly hiddenText?: boolean;
  /** Specialist invocations by the opaque id of their private namespace. */
  readonly subagents: Readonly<Record<string, ProjectionSubagent>>;
  /** When each root model round trip was asked and last answered. */
  readonly timings: Readonly<Record<string, ProjectionTiming>>;
  /** Hidden-reasoning markers by their opaque id. */
  readonly reasoning: Readonly<Record<string, ProjectionReasoning>>;
  /** Specialists' intermediate messages, when the deployment exposes work content. */
  readonly childMessages: Readonly<Record<string, ProjectionChildMessage>>;
  /** Steps of the work log in first-seen order: messages, markers, tools, invocations. */
  readonly order: readonly string[];
  /** Steps that were counted but not recorded once the step bound was reached. */
  readonly omittedSteps: number;
  /** Short digests of the omitted steps already counted (bounded by `OMITTED_MEMO_LIMIT`). */
  readonly omittedIds?: readonly string[];
  /** Bytes of reasoning and specialist text recorded, against a shared budget. */
  readonly contentBytes: number;
  /** Moment of the last projected event: when the next model round trip was asked. */
  readonly lastEventAt?: number;
}

export interface ProjectionRuntimeEvent {
  readonly id: string;
  readonly event: string;
  readonly data: unknown;
}

export interface ProjectionOptions {
  /** Clock for events whose native position carries no timestamp; defaults to `Date.now()`. */
  readonly now?: number;
  /** Record reasoning text and specialists' messages (default), or their presence only. */
  readonly content?: boolean;
}

const MESSAGE_EVENTS = new Set([
  'messages',
  'messages-tuple',
  'messages/partial',
  'messages/complete',
]);
const SEMANTIC_EVENTS = new Set([
  ...MESSAGE_EVENTS,
  'messages/metadata',
  'values',
  'updates',
  'error',
  'interrupt',
  'events',
]);

export function emptyProjection(): ProjectionState {
  return {
    activities: {},
    childMessages: {},
    contentBytes: 0,
    excluded: [],
    invocationId: null,
    lastId: null,
    lastEventDigest: null,
    messageOrder: [],
    modes: {},
    omittedSteps: 0,
    order: [],
    reasoning: {},
    sequence: 0,
    sourceId: null,
    subagents: {},
    texts: {},
    timings: {},
    version: 2,
    visibility: {},
  };
}

/**
 * Accepts a stored reducer of the current or the previous shape. Rows written before the work log
 * existed keep their tool calls without timings, in message order, and gain empty step records;
 * rows of the current shape gain the fields added since they were written.
 */
export function normalizeProjection(value: unknown): ProjectionState | null {
  const stored = record(value);
  if (stored === null) return null;
  if (stored.version === 2) {
    const reasoning = Object.fromEntries(
      Object.entries(record(stored.reasoning) ?? {}).map(([id, marker]) => [
        id,
        { text: '', ...requireRecord(marker) },
      ]),
    );
    return {
      ...(stored as unknown as ProjectionState),
      childMessages: (record(stored.childMessages) ??
        {}) as unknown as ProjectionState['childMessages'],
      contentBytes: typeof stored.contentBytes === 'number' ? stored.contentBytes : 0,
      reasoning: reasoning as unknown as ProjectionState['reasoning'],
    };
  }
  if (stored.version !== 1) return null;
  const activities = Object.fromEntries(
    Object.entries(record(stored.activities) ?? {}).map(([id, value]) => {
      const activity = requireRecord(value);
      const kind = activity.label === DELEGATION_TOOL ? ('delegation' as const) : ('tool' as const);
      return [id, { ...activity, kind, startedAt: 0 } as StoredActivity];
    }),
  );
  const messageOrder = Array.isArray(stored.messageOrder) ? (stored.messageOrder as string[]) : [];
  return {
    ...(stored as unknown as ProjectionState),
    activities,
    version: 2,
    subagents: {},
    timings: {},
    reasoning: {},
    childMessages: {},
    contentBytes: 0,
    order: [...messageOrder, ...Object.keys(activities)].slice(0, PROJECTION_LIMITS.steps),
    omittedSteps: 0,
  };
}

/** Pure, bounded reduction. The caller owns source ordering, atomic persistence and final status. */
export function projectRuntimeEvent(
  state: ProjectionState,
  event: ProjectionRuntimeEvent,
  invocationId: string,
  options: ProjectionOptions = {},
): ProjectionState {
  assertBounded(event, PROJECTION_LIMITS.eventBytes);
  // The state was bounded when it was produced; re-checking its text budget is linear in the
  // text, not a full serialisation of the reducer on every token.
  validateState(state, invocationId);
  assertTextBudget(state);
  if (!validId(event.event) || !validId(invocationId))
    throw new ProjectionError('runtime_event_invalid');
  const eventType = nativeEventType(event.event);
  const namespace = eventNamespace(event.event);
  if (!validId(event.id)) {
    if (SEMANTIC_EVENTS.has(eventType)) throw new ProjectionError('runtime_source_id_missing');
    return state;
  }
  const lastEventDigest = runtimeEventDigest(event.event, event.data);
  if (state.lastId === event.id) {
    if (state.lastEventDigest !== lastEventDigest)
      throw new ProjectionError('runtime_event_invalid');
    return state;
  }
  const context: EventContext = {
    at: nativeEventTimestamp(event.id) ?? options.now ?? Date.now(),
    nested: namespace !== null,
    namespace,
    content: options.content ?? true,
  };
  // Keep the digest above bound to the raw event name, including its private namespace.
  const projected = reduce(state, { ...event, event: eventType }, invocationId, context);
  const next = {
    ...projected,
    invocationId,
    lastId: event.id,
    lastEventDigest,
    lastEventAt: context.at,
    sequence: state.sequence + 1,
    sourceId: event.id,
  };
  validateLimits(next);
  return next;
}

export interface ProjectionMessage {
  readonly id: string;
  readonly text: string;
}

/** The visible answer: the latest allowed root message, with its opaque stable identifier. */
export function projectionMessage(state: ProjectionState): ProjectionMessage | null {
  const id = state.messageOrder.findLast(
    (id) => state.visibility[id] === 'allowed' && !state.excluded.includes(id),
  );
  return id === undefined ? null : { id, text: state.texts[id] ?? '' };
}

export function projectionText(state: ProjectionState): string {
  return projectionMessage(state)?.text ?? '';
}

/** Visible tool calls with the opaque identifier of the message that issued them. */
export function projectionToolCalls(
  state: ProjectionState,
): readonly (ProjectionActivity & { readonly messageId: string })[] {
  return Object.values(state.activities)
    .filter(
      (activity) =>
        state.visibility[activity.messageId] === 'allowed' &&
        !state.excluded.includes(activity.messageId),
    )
    .map(({ id, label, status, messageId }) => ({ id, label, status, messageId }));
}

export function projectionActivities(state: ProjectionState): readonly ProjectionActivity[] {
  return projectionToolCalls(state).map(({ id, label, status }) => ({ id, label, status }));
}

function reduce(
  state: ProjectionState,
  event: ProjectionRuntimeEvent,
  invocationId: string,
  context: EventContext,
): ProjectionState {
  if (event.event === 'error') throw new ProjectionError('runtime_failed');
  if (event.event === 'interrupt') throw new ProjectionError('runtime_interrupted');
  if (['values', 'updates'].includes(event.event) && containsInterrupt(event.data)) {
    throw new ProjectionError('runtime_interrupted');
  }
  if (event.event === 'messages/metadata') {
    return Object.entries(requireRecord(event.data)).reduce((next, [id, metadata]) => {
      if (!validId(id)) throw new ProjectionError('runtime_event_invalid');
      return classify(next, invocationId, projectionId(invocationId, 'message', id), metadata);
    }, state);
  }
  if (event.event === 'messages' || event.event === 'messages-tuple') {
    if (!Array.isArray(event.data) || event.data.length !== 2)
      throw new ProjectionError('runtime_event_invalid');
    const [message, metadata] = event.data as unknown[];
    const meta = requireRecord(metadata);
    return applyMessage(state, requireRecord(message), invocationId, 'tuple', {
      ...context,
      metadata: meta,
    });
  }
  if (event.event === 'values') {
    const data = requireRecord(event.data);
    if (data.messages === undefined) return state;
    return applyMessages(state, data.messages, invocationId, context);
  }
  if (MESSAGE_EVENTS.has(event.event))
    return applyMessages(state, event.data, invocationId, context);
  if (event.event === 'updates') {
    // A specialist's sub-graph announces itself through its first update, before any message.
    if (context.nested && context.namespace !== null)
      return ensureSubagent(state, invocationId, context.namespace, null, context.at);
    return noteRootUpdate(state, requireRecord(event.data), invocationId);
  }
  // Metadata/debug/custom/checkpoint/graph updates are never public escape hatches.
  return state;
}

function validateState(state: ProjectionState, invocationId: string): void {
  if (
    state.version !== 2 ||
    !Number.isSafeInteger(state.sequence) ||
    state.sequence < 0 ||
    state.sourceId !== state.lastId ||
    (state.lastId === null
      ? state.lastEventDigest !== null
      : typeof state.lastEventDigest !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(state.lastEventDigest)) ||
    (state.invocationId !== null && state.invocationId !== invocationId) ||
    record(state.texts) === null ||
    record(state.visibility) === null ||
    record(state.modes) === null ||
    record(state.activities) === null ||
    record(state.subagents) === null ||
    record(state.timings) === null ||
    record(state.reasoning) === null ||
    record(state.childMessages) === null ||
    !Array.isArray(state.excluded) ||
    !Array.isArray(state.messageOrder) ||
    !Array.isArray(state.order) ||
    !Number.isSafeInteger(state.omittedSteps) ||
    state.omittedSteps < 0 ||
    !Number.isSafeInteger(state.contentBytes) ||
    state.contentBytes < 0 ||
    (state.lastEventAt !== undefined && !Number.isSafeInteger(state.lastEventAt))
  ) {
    throw new ProjectionError('runtime_event_invalid');
  }
}

/** Linear in the visible text: the only unbounded part of an otherwise count-limited state. */
function assertTextBudget(state: ProjectionState): void {
  let bytes = 0;
  for (const text of Object.values(state.texts)) {
    if (typeof text !== 'string') throw new ProjectionError('runtime_event_invalid');
    bytes += Buffer.byteLength(text, 'utf8');
    if (bytes > PROJECTION_LIMITS.stateBytes) throw new ProjectionError('runtime_projection_limit');
  }
}

function validateLimits(state: ProjectionState): void {
  if (
    Object.keys(state.texts).length > PROJECTION_LIMITS.messages ||
    state.excluded.length > PROJECTION_LIMITS.messages ||
    Object.keys(state.visibility).length > PROJECTION_LIMITS.messages ||
    !Number.isSafeInteger(state.sequence) ||
    (state.hiddenText !== undefined && typeof state.hiddenText !== 'boolean')
  )
    throw new ProjectionError('runtime_projection_limit');
  assertStepLimits(state);
  assertTextBudget(state);
}
