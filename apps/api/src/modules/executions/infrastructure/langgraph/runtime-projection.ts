import {
  assertBounded,
  containsInterrupt,
  metadataExcludes,
  nativeEventType,
  PROJECTION_LIMITS,
  ProjectionError,
  projectionId,
  record,
  requireRecord,
  runtimeEventDigest,
  safeToolLabel,
  textContent,
  validId,
} from './runtime-projection-data';

export { PROJECTION_LIMITS, ProjectionError } from './runtime-projection-data';

export interface ProjectionActivity {
  readonly id: string;
  readonly label: string;
  readonly status: 'running' | 'completed' | 'failed';
}

export interface ProjectionState {
  readonly version: 1;
  readonly sequence: number;
  readonly sourceId: string | null;
  readonly invocationId: string | null;
  readonly texts: Readonly<Record<string, string>>;
  readonly excluded: readonly string[];
  /** Native source watermark. Persist atomically with this reducer and its public projection. */
  readonly lastId: string | null;
  /** Fingerprint of the last source event; a reused cursor must identify identical content. */
  readonly lastEventDigest: string | null;
  readonly activities: Readonly<
    Record<string, ProjectionActivity & { readonly messageId: string }>
  >;
  readonly visibility: Readonly<Record<string, 'allowed' | 'pending'>>;
  readonly modes: Readonly<Record<string, 'tuple' | 'cumulative'>>;
  readonly messageOrder: readonly string[];
  /** Text from a namespaced sub-graph was seen and withheld (ALF-DEC-037). Optional for v1 rows. */
  readonly hiddenText?: boolean;
}

export interface ProjectionRuntimeEvent {
  readonly id: string;
  readonly event: string;
  readonly data: unknown;
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
    excluded: [],
    invocationId: null,
    lastId: null,
    lastEventDigest: null,
    messageOrder: [],
    modes: {},
    sequence: 0,
    sourceId: null,
    texts: {},
    version: 1,
    visibility: {},
  };
}

/** Pure, bounded reduction. The caller owns source ordering, atomic persistence and final status. */
export function projectRuntimeEvent(
  state: ProjectionState,
  event: ProjectionRuntimeEvent,
  invocationId: string,
): ProjectionState {
  assertBounded(event, PROJECTION_LIMITS.eventBytes);
  // The state was bounded when it was produced; re-checking its text budget is linear in the
  // text, not a full serialisation of the reducer on every token.
  validateState(state, invocationId);
  assertTextBudget(state);
  if (!validId(event.event) || !validId(invocationId))
    throw new ProjectionError('runtime_event_invalid');
  const eventType = nativeEventType(event.event);
  const nested = event.event.length > eventType.length;
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
  // Keep the digest above bound to the raw event name, including its private namespace.
  const projected = reduce(state, { ...event, event: eventType }, invocationId, nested);
  const next = {
    ...projected,
    invocationId,
    lastId: event.id,
    lastEventDigest,
    sequence: state.sequence + 1,
    sourceId: event.id,
  };
  validateLimits(next);
  return next;
}

export function projectionText(state: ProjectionState): string {
  const id = state.messageOrder.findLast(
    (id) => state.visibility[id] === 'allowed' && !state.excluded.includes(id),
  );
  return id === undefined ? '' : (state.texts[id] ?? '');
}

export function projectionActivities(state: ProjectionState): readonly ProjectionActivity[] {
  return Object.values(state.activities)
    .filter(
      (activity) =>
        state.visibility[activity.messageId] === 'allowed' &&
        !state.excluded.includes(activity.messageId),
    )
    .map(({ id, label, status }) => ({ id, label, status }));
}

/**
 * `nested` marks an event emitted by a namespaced sub-graph (specialist). Its tool activity is
 * kept, its message text never becomes the assistant answer (ALF-DEC-037 excludes internal child
 * messages from the product record); the root graph's answer is the only visible text.
 */
function reduce(
  state: ProjectionState,
  event: ProjectionRuntimeEvent,
  invocationId: string,
  nested: boolean,
): ProjectionState {
  if (event.event === 'error') throw new ProjectionError('runtime_failed');
  if (event.event === 'interrupt') throw new ProjectionError('runtime_interrupted');
  if (['values', 'updates'].includes(event.event) && containsInterrupt(event.data)) {
    throw new ProjectionError('runtime_interrupted');
  }
  if (event.event === 'messages/metadata') {
    return Object.entries(requireRecord(event.data)).reduce((next, [id, metadata]) => {
      if (!validId(id)) throw new ProjectionError('runtime_event_invalid');
      return classify(next, projectionId(invocationId, 'message', id), metadata);
    }, state);
  }
  if (event.event === 'messages' || event.event === 'messages-tuple') {
    if (!Array.isArray(event.data) || event.data.length !== 2)
      throw new ProjectionError('runtime_event_invalid');
    const [message, metadata] = event.data as unknown[];
    requireRecord(metadata);
    return applyMessage(state, requireRecord(message), invocationId, 'tuple', nested, metadata);
  }
  if (event.event === 'values') {
    const data = requireRecord(event.data);
    if (data.messages === undefined) return state;
    return applyMessages(state, data.messages, invocationId, nested);
  }
  if (MESSAGE_EVENTS.has(event.event))
    return applyMessages(state, event.data, invocationId, nested);
  // Metadata/debug/custom/checkpoint/graph updates are never public escape hatches.
  return state;
}

function applyMessages(
  state: ProjectionState,
  data: unknown,
  invocationId: string,
  nested: boolean,
): ProjectionState {
  if (!Array.isArray(data)) throw new ProjectionError('runtime_event_invalid');
  if (data.length > PROJECTION_LIMITS.messages)
    throw new ProjectionError('runtime_projection_limit');
  return data.reduce(
    (next: ProjectionState, value: unknown) =>
      applyMessage(next, requireRecord(value), invocationId, 'cumulative', nested),
    state,
  );
}

function applyMessage(
  state: ProjectionState,
  message: Record<string, unknown>,
  invocationId: string,
  mode: 'tuple' | 'cumulative',
  nested: boolean,
  metadata?: unknown,
): ProjectionState {
  if (message.type === 'tool') return finishTool(state, message, invocationId);
  if (!['ai', 'AIMessage', 'AIMessageChunk'].includes(String(message.type))) return state;
  if (!validId(message.id)) throw new ProjectionError('runtime_event_invalid');
  const id = projectionId(invocationId, 'message', message.id);
  const classification = metadata ?? message.metadata;
  const classified = classification === undefined ? state : classify(state, id, classification);
  if (classified.excluded.includes(id)) return classified;
  const withTools = rememberTools(classified, message, invocationId, id);
  const text = textContent(message.content);
  if (nested) {
    return text === '' || withTools.hiddenText === true
      ? withTools
      : { ...withTools, hiddenText: true };
  }
  if (text === '' && !Object.hasOwn(withTools.texts, id)) return withTools;
  const cumulativeWins = mode === 'tuple' && withTools.modes[id] === 'cumulative';
  if (cumulativeWins) return withTools;
  const content = mode === 'tuple' ? (withTools.texts[id] ?? '') + text : text;
  if (Buffer.byteLength(content, 'utf8') > PROJECTION_LIMITS.textBytes)
    throw new ProjectionError('runtime_projection_limit');
  return {
    ...withTools,
    messageOrder: [...withTools.messageOrder.filter((previous) => previous !== id), id],
    modes: { ...withTools.modes, [id]: mode },
    texts: { ...withTools.texts, [id]: content },
    visibility: { ...withTools.visibility, [id]: withTools.visibility[id] ?? 'pending' },
  };
}

function classify(state: ProjectionState, id: string, metadata: unknown): ProjectionState {
  if (!metadataExcludes(metadata)) {
    return state.excluded.includes(id)
      ? state
      : { ...state, visibility: { ...state.visibility, [id]: 'allowed' } };
  }
  if (
    state.visibility[id] === 'allowed' &&
    (Object.hasOwn(state.texts, id) ||
      Object.values(state.activities).some((activity) => activity.messageId === id))
  ) {
    throw new ProjectionError('runtime_event_invalid');
  }
  return {
    ...state,
    activities: Object.fromEntries(
      Object.entries(state.activities).filter(([, value]) => value.messageId !== id),
    ),
    excluded: state.excluded.includes(id) ? state.excluded : [...state.excluded, id],
    messageOrder: state.messageOrder.filter((value) => value !== id),
    modes: Object.fromEntries(Object.entries(state.modes).filter(([key]) => key !== id)),
    texts: Object.fromEntries(Object.entries(state.texts).filter(([key]) => key !== id)),
    visibility: Object.fromEntries(Object.entries(state.visibility).filter(([key]) => key !== id)),
  };
}

function rememberTools(
  state: ProjectionState,
  message: Record<string, unknown>,
  invocationId: string,
  messageId: string,
): ProjectionState {
  if (message.tool_calls === undefined) return state;
  if (!Array.isArray(message.tool_calls)) throw new ProjectionError('runtime_event_invalid');
  return message.tool_calls.reduce((next: ProjectionState, value: unknown) => {
    const tool = requireRecord(value);
    if (!validId(tool.id)) {
      if (message.type === 'AIMessageChunk' && (tool.id === null || tool.id === undefined))
        return next;
      throw new ProjectionError('runtime_event_invalid');
    }
    const id = projectionId(invocationId, 'tool', tool.id);
    const previous = next.activities[id];
    if (previous !== undefined) return next;
    const activity = { id, label: safeToolLabel(tool.name), messageId, status: 'running' as const };
    return { ...next, activities: { ...next.activities, [id]: activity } };
  }, state);
}

function finishTool(
  state: ProjectionState,
  message: Record<string, unknown>,
  invocationId: string,
): ProjectionState {
  if (!validId(message.tool_call_id)) throw new ProjectionError('runtime_event_invalid');
  const id = projectionId(invocationId, 'tool', message.tool_call_id);
  const activity = state.activities[id];
  if (activity === undefined) return state;
  const status = message.status === 'error' ? 'failed' : 'completed';
  return { ...state, activities: { ...state.activities, [id]: { ...activity, status } } };
}

function validateState(state: ProjectionState, invocationId: string): void {
  if (
    state.version !== 1 ||
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
    !Array.isArray(state.excluded) ||
    !Array.isArray(state.messageOrder)
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
    Object.keys(state.activities).length > PROJECTION_LIMITS.activities ||
    !Number.isSafeInteger(state.sequence) ||
    (state.hiddenText !== undefined && typeof state.hiddenText !== 'boolean')
  )
    throw new ProjectionError('runtime_projection_limit');
  assertTextBudget(state);
}
