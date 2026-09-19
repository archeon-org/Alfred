import type { ProjectionState } from './runtime-projection';
import {
  checkpointNamespace,
  DELEGATION_TOOL,
  metadataExcludes,
  PROJECTION_LIMITS,
  ProjectionError,
  projectionId,
  reasoningText,
  record,
  requireRecord,
  safeSpecialist,
  safeToolLabel,
  textContent,
  validId,
} from './runtime-projection-data';
import { noteChildText, noteReasoning } from './runtime-projection-content';
import {
  ensureSubagent,
  linkDelegation,
  linkPending,
  noteDelegationSpecialist,
  resolveWithoutInvocation,
  settleSubagent,
} from './runtime-projection-links';
import {
  dropMessageSteps,
  hasMessageSteps,
  hasStepRoom,
  omitStep,
  ownerEnded,
  produced,
  pushStep,
  subagentProjectionId,
  type StoredActivity,
} from './runtime-projection-steps';

/** Where and when one native event happened, as the reducer needs it. */
export interface EventContext {
  readonly at: number;
  readonly nested: boolean;
  readonly namespace: string | null;
  /** Whether reasoning text and specialists' messages are recorded, not only marked. */
  readonly content: boolean;
  readonly metadata?: Record<string, unknown>;
}

const AI_TYPES = new Set(['ai', 'AIMessage', 'AIMessageChunk']);

export function applyMessages(
  state: ProjectionState,
  data: unknown,
  invocationId: string,
  context: EventContext,
): ProjectionState {
  if (!Array.isArray(data)) throw new ProjectionError('runtime_event_invalid');
  if (data.length > PROJECTION_LIMITS.messages)
    throw new ProjectionError('runtime_projection_limit');
  return data.reduce(
    (next: ProjectionState, value: unknown) =>
      applyMessage(next, requireRecord(value), invocationId, 'cumulative', context),
    state,
  );
}

/**
 * A namespaced message comes from a specialist's sub-graph: its tool activity is kept under that
 * invocation and its text never becomes the assistant answer; it is recorded as the specialist's
 * intermediate message only when the deployment exposes work content. The root graph's answer is
 * the only visible text.
 */
export function applyMessage(
  state: ProjectionState,
  message: Record<string, unknown>,
  invocationId: string,
  mode: 'tuple' | 'cumulative',
  context: EventContext,
): ProjectionState {
  if (message.type === 'tool') return finishTool(state, message, invocationId, context);
  if (!AI_TYPES.has(String(message.type))) return state;
  if (!validId(message.id)) throw new ProjectionError('runtime_event_invalid');
  const id = projectionId(invocationId, 'message', message.id);
  const subagentId =
    context.nested && context.namespace !== null
      ? subagentProjectionId(invocationId, context.namespace)
      : undefined;
  const seen =
    context.nested && context.namespace !== null
      ? ensureSubagent(
          state,
          invocationId,
          context.namespace,
          safeSpecialist(context.metadata?.lc_agent_name),
          context.at,
        )
      : state;
  const classification = context.metadata ?? message.metadata;
  const classified =
    classification === undefined ? seen : classify(seen, invocationId, id, classification);
  if (classified.excluded.includes(id)) return classified;
  // A model writes its reasoning, then its words, then calls its tools: steps keep that order.
  const reasoning = reasoningText(message);
  const withMarkers =
    reasoning === ''
      ? classified
      : noteReasoning(
          classified,
          invocationId,
          id,
          context.at,
          context.content ? reasoning : null,
          subagentId,
          produced(classified, id),
        );
  const text = textContent(message.content);
  const withText =
    subagentId === undefined
      ? rootText(withMarkers, id, text, mode, context)
      : childText(withMarkers, invocationId, id, subagentId, text, mode, context);
  return rememberTools(withText, message, invocationId, id, context);
}

function childText(
  state: ProjectionState,
  invocationId: string,
  id: string,
  subagentId: string,
  text: string,
  mode: 'tuple' | 'cumulative',
  context: EventContext,
): ProjectionState {
  if (text === '') return state;
  const hidden = state.hiddenText === true ? state : { ...state, hiddenText: true };
  return context.content
    ? noteChildText(hidden, invocationId, id, subagentId, text, mode, context.at)
    : hidden;
}

/** Every model round trip of the orchestrator is timed from the moment it was asked. */
function rootText(
  state: ProjectionState,
  id: string,
  text: string,
  mode: 'tuple' | 'cumulative',
  context: EventContext,
): ProjectionState {
  const timing = state.timings[id];
  const started: ProjectionState =
    timing === undefined
      ? pushStep(
          {
            ...state,
            timings: {
              ...state.timings,
              [id]: { startedAt: state.lastEventAt ?? context.at, finishedAt: context.at },
            },
          },
          id,
        )
      : state;
  if (text === '' && !Object.hasOwn(started.texts, id)) return started;
  const cumulativeWins = mode === 'tuple' && started.modes[id] === 'cumulative';
  if (cumulativeWins) return started;
  const content = mode === 'tuple' ? (started.texts[id] ?? '') + text : text;
  if (Buffer.byteLength(content, 'utf8') > PROJECTION_LIMITS.textBytes)
    throw new ProjectionError('runtime_projection_limit');
  const timings = {
    ...started.timings,
    [id]: { startedAt: started.timings[id]?.startedAt ?? context.at, finishedAt: context.at },
  };
  // A chunk that adds nothing (the closing chunk of a round trip) does not make an earlier
  // message the latest again: only words move the answer.
  if (started.texts[id] === content)
    return { ...started, modes: { ...started.modes, [id]: mode }, timings };
  return {
    ...started,
    messageOrder: [...started.messageOrder.filter((previous) => previous !== id), id],
    modes: { ...started.modes, [id]: mode },
    texts: { ...started.texts, [id]: content },
    timings,
    visibility: { ...started.visibility, [id]: started.visibility[id] ?? 'pending' },
  };
}

export function classify(
  state: ProjectionState,
  invocationId: string,
  id: string,
  metadata: unknown,
): ProjectionState {
  if (!metadataExcludes(metadata)) {
    return state.excluded.includes(id)
      ? state
      : { ...state, visibility: { ...state.visibility, [id]: 'allowed' } };
  }
  // Anything already disclosed (words, a marker, a tool call, a timed round trip) is never
  // silently retracted: an observer may have seen it (ALF-DEC-006 §5).
  if (
    state.visibility[id] === 'allowed' &&
    (Object.hasOwn(state.texts, id) ||
      Object.hasOwn(state.timings, id) ||
      hasMessageSteps(state, invocationId, id))
  ) {
    throw new ProjectionError('runtime_event_invalid');
  }
  const dropped = dropMessageSteps(state, invocationId, id);
  return {
    ...dropped,
    excluded: state.excluded.includes(id) ? state.excluded : [...state.excluded, id],
    messageOrder: state.messageOrder.filter((value) => value !== id),
    modes: Object.fromEntries(Object.entries(state.modes).filter(([key]) => key !== id)),
    texts: Object.fromEntries(Object.entries(state.texts).filter(([key]) => key !== id)),
    timings: Object.fromEntries(Object.entries(state.timings).filter(([key]) => key !== id)),
    visibility: Object.fromEntries(Object.entries(state.visibility).filter(([key]) => key !== id)),
  };
}

function rememberTools(
  state: ProjectionState,
  message: Record<string, unknown>,
  invocationId: string,
  messageId: string,
  context: EventContext,
): ProjectionState {
  if (message.tool_calls === undefined) return state;
  if (!Array.isArray(message.tool_calls)) throw new ProjectionError('runtime_event_invalid');
  const owner =
    context.nested && context.namespace !== null
      ? subagentProjectionId(invocationId, context.namespace)
      : undefined;
  // A call streamed after its invocation ended (its delegation returned) is not part of its work.
  if (ownerEnded(state, owner)) return state;
  return message.tool_calls.reduce((next: ProjectionState, value: unknown) => {
    const tool = requireRecord(value);
    if (!validId(tool.id)) {
      if (message.type === 'AIMessageChunk' && (tool.id === null || tool.id === undefined))
        return next;
      throw new ProjectionError('runtime_event_invalid');
    }
    const id = projectionId(invocationId, 'tool', tool.id);
    if (next.activities[id] !== undefined) return noteDelegationSpecialist(next, id, tool.args);
    if (!hasStepRoom(next)) return omitStep(next, id);
    const kind = !context.nested && tool.name === DELEGATION_TOOL ? 'delegation' : 'tool';
    const activity: StoredActivity = {
      id,
      label: safeToolLabel(tool.name),
      messageId,
      status: 'running',
      kind,
      startedAt: context.at,
      ...(owner === undefined ? {} : { subagentId: owner }),
    };
    const added = pushStep({ ...next, activities: { ...next.activities, [id]: activity } }, id);
    return kind === 'delegation' ? noteDelegationSpecialist(added, id, tool.args) : added;
  }, state);
}

/** Root node updates carry complete tool calls: the specialist a delegation asked for. */
export function noteRootUpdate(
  state: ProjectionState,
  data: Record<string, unknown>,
  invocationId: string,
): ProjectionState {
  return Object.values(data).reduce((next: ProjectionState, update: unknown) => {
    const messages = record(update)?.messages;
    if (!Array.isArray(messages)) return next;
    return messages.reduce((inner: ProjectionState, value: unknown) => {
      const message = record(value);
      if (message === null || !AI_TYPES.has(String(message.type))) return inner;
      if (!Array.isArray(message.tool_calls)) return inner;
      return message.tool_calls.reduce((current: ProjectionState, call: unknown) => {
        const tool = record(call);
        if (tool === null || !validId(tool.id)) return current;
        return noteDelegationSpecialist(
          current,
          projectionId(invocationId, 'tool', tool.id),
          tool.args,
        );
      }, inner);
    }, next);
  }, state);
}

function finishTool(
  state: ProjectionState,
  message: Record<string, unknown>,
  invocationId: string,
  context: EventContext,
): ProjectionState {
  if (!validId(message.tool_call_id)) throw new ProjectionError('runtime_event_invalid');
  const id = projectionId(invocationId, 'tool', message.tool_call_id);
  const activity = state.activities[id];
  // The first outcome stands: a replayed result, or one arriving after its invocation ended and
  // interrupted the call, never reopens or changes an outcome an observer saw.
  if (activity === undefined || activity.status !== 'running') return state;
  const status = message.status === 'error' ? 'failed' : 'completed';
  const finished: StoredActivity = {
    ...activity,
    status,
    finishedAt: activity.finishedAt ?? context.at,
  };
  const next = { ...state, activities: { ...state.activities, [id]: finished } };
  if (activity.kind !== 'delegation') return next;
  // The delegation's result names the namespace its specialist ran in: the confirmed link.
  const namespace = checkpointNamespace(context.metadata?.langgraph_checkpoint_ns);
  const exactId = namespace === null ? null : subagentProjectionId(invocationId, namespace);
  const linked =
    exactId === null
      ? next
      : next.subagents[exactId] !== undefined
        ? linkDelegation(next, id, exactId, 'exact')
        : resolveWithoutInvocation(next, id);
  const subagentId = linked.activities[id]?.subagentId;
  // A finished delegation no longer waits: the invocations it left may now pair unambiguously.
  return linkPending(
    subagentId === undefined ? linked : settleSubagent(linked, subagentId, status, context.at),
  );
}
