import {
  EXECUTION_WORK_TEXT_MAX_LENGTH,
  type ExecutionWork,
  type WorkStep,
  type WorkStepStatus,
} from '@alfred/contracts';
import { projectionMessage, type ProjectionState } from './runtime-projection';
import { delegationWaiter, unlinkedOutcome } from './runtime-projection-links';
import type { ActivityStatus, ProjectionSubagent } from './runtime-projection-steps';
import { produced, reasoningProjectionId } from './runtime-projection-steps';

/** A step as the observation boundary sees it: the public step plus the message that issued it. */
export interface ObservedStep extends WorkStep {
  /** Root tool calls and markers only: the opaque id of the assistant message behind them. */
  readonly messageId?: string;
}

export interface ObservedWork {
  readonly steps: readonly ObservedStep[];
  readonly omittedSteps: number;
}

export interface WorkOptions {
  /** The execution settled: steps still running are reported as interrupted at `endedAt`. */
  readonly settled: boolean;
  readonly endedAt: number | null;
  /** Bound of narration and reasoning text; the stream keeps it whole, the JSON profile bounds it. */
  readonly textLimit?: number;
}

/** A visible root message with the moments it started and last grew. */
export interface ObservedMessage {
  readonly id: string;
  readonly text: string;
  readonly startedAt: number;
  readonly finishedAt: number;
}

export function projectionMessages(state: ProjectionState): readonly ObservedMessage[] {
  return state.messageOrder
    .filter((id) => visible(state, id))
    .map((id) => {
      const timing = state.timings[id];
      return {
        id,
        text: state.texts[id] ?? '',
        startedAt: timing?.startedAt ?? 0,
        finishedAt: timing?.finishedAt ?? 0,
      };
    });
}

const ROOT = '';

/**
 * The work log of one projection in first-seen order. The answer itself is not a step; earlier
 * visible messages are narration. Steps of a specialist name their delegation, or the invocation
 * itself once no waiting delegation could own it; those of an invocation not yet announced, or
 * that a waiting delegation could still own, wait. A text step (reasoning, a specialist's
 * message) is still running while it is the latest step of its owner and the execution goes on.
 * A round trip without output is reported once a later one began. Every rule only ever adds
 * steps, grows open text or closes steps, so an observer can always continue (ALF-DEC-006 §5).
 */
export function projectionWork(state: ProjectionState, options: WorkOptions): ObservedWork {
  const answerId = projectionMessage(state)?.id;
  const steps: ObservedStep[] = [];
  const pending = new Map<string, boolean>();
  const mayBelongToDelegation = delegationWaiter(state);
  const reportable = (subagent: ProjectionSubagent): boolean => {
    if (!announced(subagent)) return false;
    if (options.settled || subagent.delegationId !== null) return true;
    let waiting = pending.get(subagent.id);
    if (waiting === undefined) {
      waiting = mayBelongToDelegation(subagent);
      pending.set(subagent.id, waiting);
    }
    return !waiting;
  };
  const producing = new Set(Object.values(state.activities).map((activity) => activity.messageId));
  let lastTiming = -1;
  state.order.forEach((id, index) => {
    if (state.timings[id] !== undefined) lastTiming = index;
  });
  /** Provisional: a text step is settled below once the latest step of its owner is known. */
  const open = new Map<string, { readonly owner: string; readonly ownerRunning: boolean }>();
  const running = (id: string, owner: string, ownerRunning: boolean): boolean => {
    if (options.settled || !ownerRunning) return false;
    open.set(id, { owner, ownerRunning });
    return true;
  };
  for (const [index, id] of state.order.entries()) {
    const timing = state.timings[id];
    if (timing !== undefined) {
      if (id === answerId || !visible(state, id)) continue;
      const text = state.texts[id];
      if (text === undefined) {
        const busy =
          producing.has(id) ||
          state.reasoning[reasoningProjectionId(state.invocationId ?? '', id)] !== undefined;
        // Still possibly producing until a later round trip began or the execution settled.
        if (!busy && (options.settled || index < lastTiming))
          steps.push({
            id,
            kind: 'generation',
            label: '',
            status: 'completed',
            startedAt: timing.startedAt,
            finishedAt: timing.finishedAt,
          });
        continue;
      }
      steps.push({
        id,
        kind: 'message',
        label: '',
        status: 'completed',
        startedAt: timing.startedAt,
        finishedAt: timing.finishedAt,
        text: boundText(text, options.textLimit),
      });
      continue;
    }
    const marker = state.reasoning[id];
    if (marker !== undefined) {
      if (!visible(state, marker.messageId)) continue;
      const parent = parentOf(state, marker.subagentId, reportable);
      if (parent === null) continue;
      // Reasoning precedes the words or tool calls of its own message: either closes it. A
      // continuation follows them already and closes only with a later step of its owner.
      const open =
        (marker.segment !== undefined || !produced(state, marker.messageId)) &&
        running(id, parent.id ?? ROOT, parent.running);
      steps.push({
        id,
        kind: 'reasoning',
        label: '',
        status: open ? 'running' : 'completed',
        startedAt: marker.startedAt,
        finishedAt: open ? null : marker.finishedAt,
        text: boundText(marker.text, options.textLimit),
        ...(parent.id === undefined ? { messageId: marker.messageId } : { parentId: parent.id }),
      });
      continue;
    }
    const child = state.childMessages[id];
    if (child !== undefined) {
      if (!visible(state, child.messageId ?? id)) continue;
      const parent = parentOf(state, child.subagentId, reportable);
      if (parent === null || parent.id === undefined) continue;
      const open = running(id, parent.id, parent.running);
      steps.push({
        id,
        kind: 'message',
        label: '',
        status: open ? 'running' : 'completed',
        startedAt: child.startedAt,
        finishedAt: open ? null : child.finishedAt,
        text: boundText(child.text, options.textLimit),
        parentId: parent.id,
      });
      continue;
    }
    const activity = state.activities[id];
    if (activity !== undefined) {
      if (!visible(state, activity.messageId)) continue;
      const invocation =
        activity.subagentId === undefined ? undefined : state.subagents[activity.subagentId];
      const subagent =
        invocation !== undefined && invocation.delegationId === id && announced(invocation)
          ? invocation
          : undefined;
      const status = settleStatus(activity.status, options);
      const finishedAt = activity.finishedAt ?? (options.settled ? options.endedAt : null);
      if (activity.kind === 'delegation') {
        steps.push({
          id,
          kind: 'delegation',
          label: activity.label,
          status,
          startedAt: activity.startedAt,
          finishedAt,
          messageId: activity.messageId,
          ...specialistOf(activity.specialist ?? subagent?.name ?? null),
          ...(subagent === undefined
            ? {}
            : { subagentStatus: settleStatus(subagent.status, options) }),
        });
        continue;
      }
      const parent = parentOf(state, activity.subagentId, reportable);
      if (parent === null) continue;
      steps.push({
        id,
        kind: 'tool',
        label: activity.label,
        status,
        startedAt: activity.startedAt,
        finishedAt,
        ...(parent.id === undefined ? { messageId: activity.messageId } : { parentId: parent.id }),
      });
      continue;
    }
    const subagent = state.subagents[id];
    if (subagent !== undefined && subagent.delegationId === null && reportable(subagent)) {
      // Reported on its own only once settled when a delegation could have started it: it ended
      // with those delegations when they all ended alike.
      const outcome = options.settled ? unlinkedOutcome(state, subagent) : null;
      const status = outcome?.status ?? settleStatus(subagent.status, options);
      steps.push({
        id,
        kind: 'subagent',
        label: 'subagent',
        status,
        startedAt: subagent.startedAt,
        finishedAt:
          subagent.finishedAt ?? outcome?.finishedAt ?? (options.settled ? options.endedAt : null),
        subagentStatus: status,
        ...specialistOf(subagent.name),
      });
    }
  }
  return {
    steps: settleOpenText(withValidParents(steps), open, state),
    omittedSteps: state.omittedSteps,
  };
}

/**
 * A text step (reasoning, a specialist's message) is still growing only while it is the latest
 * step of its owner (the orchestrator or one invocation); once a later step of that owner is
 * reported, it is complete at the moment it last grew.
 */
function settleOpenText(
  steps: readonly ObservedStep[],
  open: ReadonlyMap<string, { readonly owner: string }>,
  state: ProjectionState,
): ObservedStep[] {
  const latest = new Map<string, string>();
  for (const step of steps) latest.set(step.parentId ?? ROOT, step.id);
  return steps.map((step) => {
    const claim = open.get(step.id);
    if (claim === undefined || latest.get(claim.owner) === step.id) return step;
    const finishedAt =
      state.reasoning[step.id]?.finishedAt ?? state.childMessages[step.id]?.finishedAt ?? null;
    return { ...step, status: 'completed', finishedAt };
  });
}

/** The public profile of the work: message ids stay inside the observation boundary. */
export function presentWork(work: ObservedWork): ExecutionWork {
  return {
    steps: work.steps.map(({ messageId: _messageId, ...step }) => {
      void _messageId;
      return step;
    }),
    omittedSteps: work.omittedSteps,
  };
}

function visible(state: ProjectionState, messageId: string): boolean {
  return state.visibility[messageId] === 'allowed' && !state.excluded.includes(messageId);
}

/**
 * A specialist first shows through its sub-graph's node updates, before any message names it. It
 * is reported once named, or once finished, so an observer never learns a name after the fact.
 */
function announced(subagent: ProjectionSubagent): boolean {
  return subagent.name !== null || subagent.status !== 'running';
}

interface Parent {
  /** The step a nested step names; undefined for a step of the orchestrator itself. */
  readonly id?: string;
  readonly running: boolean;
}

/** Null when the step belongs to an invocation that is not yet reported. */
function parentOf(
  state: ProjectionState,
  subagentId: string | undefined,
  reportable: (subagent: ProjectionSubagent) => boolean,
): Parent | null {
  if (subagentId === undefined) return { running: true };
  const subagent = state.subagents[subagentId];
  if (subagent === undefined || !reportable(subagent)) return null;
  return { id: subagent.delegationId ?? subagent.id, running: subagent.status === 'running' };
}

function settleStatus(status: ActivityStatus, options: WorkOptions): WorkStepStatus {
  return status === 'running' && options.settled ? 'interrupted' : status;
}

function specialistOf(name: string | null): { readonly specialist?: string } {
  return name === null ? {} : { specialist: name };
}

/** Bounds a JavaScript string length, never splitting a surrogate pair before the ellipsis. */
function boundText(text: string, limit = EXECUTION_WORK_TEXT_MAX_LENGTH): string {
  if (text.length <= limit) return text;
  const end = Math.max(0, limit - 1);
  const cut = /[\uD800-\uDBFF]/.test(text.charAt(end - 1)) ? end - 1 : end;
  return `${text.slice(0, cut)}…`;
}

/** A nested step whose parent is not itself a step never links to nothing: it is not reported. */
function withValidParents(steps: readonly ObservedStep[]): ObservedStep[] {
  const parents = new Set(
    steps.filter((step) => step.subagentStatus !== undefined).map((step) => step.id),
  );
  return steps.filter((step) => step.parentId === undefined || parents.has(step.parentId));
}

export type { ProjectionSubagent };
