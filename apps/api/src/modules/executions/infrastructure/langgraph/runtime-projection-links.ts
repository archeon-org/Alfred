import { record, safeSpecialist } from './runtime-projection-data';
import {
  hasStepRoom,
  omitStep,
  pushStep,
  subagentProjectionId,
  type ActivityStatus,
  type ProjectionSubagent,
  type StepState,
  type StoredActivity,
} from './runtime-projection-steps';

/**
 * A specialist invocation seen through its namespace. The first name the runtime gives it sticks,
 * so an observer never learns a different specialist after the fact.
 */
export function ensureSubagent<S extends StepState>(
  state: S,
  invocationId: string,
  namespace: string,
  name: string | null,
  at: number,
): S {
  const id = subagentProjectionId(invocationId, namespace);
  const existing = state.subagents[id];
  if (existing !== undefined) {
    if (name === null || existing.name !== null || existing.status !== 'running') return state;
    return linkPending({
      ...state,
      subagents: { ...state.subagents, [id]: { ...existing, name } },
    });
  }
  if (!hasStepRoom(state)) return omitStep(state, id);
  const subagent: ProjectionSubagent = {
    id,
    name,
    delegationId: null,
    status: 'running',
    startedAt: at,
  };
  return linkPending(pushStep({ ...state, subagents: { ...state.subagents, [id]: subagent } }, id));
}

/** The complete delegation arguments name the specialist; the link may follow from it. */
export function noteDelegationSpecialist<S extends StepState>(
  state: S,
  activityId: string,
  args: unknown,
): S {
  const activity = state.activities[activityId];
  if (activity === undefined || activity.kind !== 'delegation' || activity.specialist !== undefined)
    return state;
  const specialist = safeSpecialist(record(args)?.subagent_type);
  if (specialist === null) return state;
  const next = {
    ...state,
    activities: { ...state.activities, [activityId]: { ...activity, specialist } },
  };
  return activity.subagentId === undefined ? linkPending(next) : next;
}

/**
 * Whether a delegation could have started an invocation, whatever names either carries (a
 * specialist may run under another name than the one requested): not yet linked nor resolved,
 * requested before the invocation began, and still waiting, or ended after it began without its
 * result naming a namespace. Such an ended delegation stays a candidate, so an invocation it may
 * have started is never inferred to belong to another one.
 */
function mayOwn(delegation: StoredActivity, subagent: ProjectionSubagent): boolean {
  return (
    delegation.kind === 'delegation' &&
    delegation.subagentId === undefined &&
    delegation.link === undefined &&
    subagent.delegationId === null &&
    delegation.startedAt <= subagent.startedAt &&
    (delegation.status === 'running' ||
      (delegation.finishedAt ?? Number.POSITIVE_INFINITY) >= subagent.startedAt)
  );
}

/** Names agree when either is unknown or both are the same specialist. */
function namesAgree(delegation: StoredActivity, subagent: ProjectionSubagent): boolean {
  return (
    subagent.name === null ||
    delegation.specialist === undefined ||
    delegation.specialist === subagent.name
  );
}

/**
 * Delegations still open to a link: neither linked nor resolved. Only these can own an unlinked
 * invocation, so every lookup below scans this list once per call instead of every activity.
 */
function unresolvedDelegations(state: StepState): StoredActivity[] {
  return Object.values(state.activities).filter(
    (activity) =>
      activity.kind === 'delegation' &&
      activity.subagentId === undefined &&
      activity.link === undefined,
  );
}

/** Candidate owners of an invocation, counting at most `limit` (all of them by default). */
function candidates(
  delegations: readonly StoredActivity[],
  subagent: ProjectionSubagent,
  named: boolean,
  limit = Number.POSITIVE_INFINITY,
): StoredActivity[] {
  const owners: StoredActivity[] = [];
  for (const delegation of delegations) {
    if (!mayOwn(delegation, subagent) || (named && !namesAgree(delegation, subagent))) continue;
    owners.push(delegation);
    if (owners.length >= limit) break;
  }
  return owners;
}

/** Whether the delegation could own exactly one unlinked invocation, stopping at the second. */
function ownsOneInvocation(
  subagents: readonly ProjectionSubagent[],
  delegation: StoredActivity,
): boolean {
  let count = 0;
  for (const subagent of subagents) {
    if (!mayOwn(delegation, subagent) || !namesAgree(delegation, subagent)) continue;
    count += 1;
    if (count > 1) return false;
  }
  return count === 1;
}

/**
 * True while a delegation could still turn out to own this unlinked invocation, names aside. The
 * work log withholds such an invocation (and its steps) instead of reporting it on its own and
 * moving it later. Delegations requested afterwards can never own it, so once false it stays false.
 */
export function mayBelongToDelegation(state: StepState, subagent: ProjectionSubagent): boolean {
  return delegationWaiter(state)(subagent);
}

/**
 * `mayBelongToDelegation` for many invocations of one state: the unresolved delegations are
 * collected once, and each lookup stops at the first candidate.
 */
export function delegationWaiter(state: StepState): (subagent: ProjectionSubagent) => boolean {
  let delegations: StoredActivity[] | undefined;
  return (subagent) => {
    if (subagent.delegationId !== null) return false;
    delegations ??= unresolvedDelegations(state);
    return candidates(delegations, subagent, false, 1).length > 0;
  };
}

/**
 * The outcome of an invocation never linked, once every delegation that could have started it
 * ended with the same outcome: whichever owned it, the invocation ended that way by then.
 */
export function unlinkedOutcome(
  state: StepState,
  subagent: ProjectionSubagent,
): { readonly status: ActivityStatus; readonly finishedAt: number } | null {
  const owners = candidates(unresolvedDelegations(state), subagent, false);
  const first = owners[0];
  if (first === undefined || first.status === 'running') return null;
  if (owners.some((owner) => owner.status !== first.status)) return null;
  const finishedAt = Math.max(...owners.map((owner) => owner.finishedAt ?? owner.startedAt));
  return { status: first.status, finishedAt };
}

/**
 * Infers the links that cannot be wrong: a named invocation that exactly one delegation of its
 * specialist could own, while that delegation could own no other invocation. Parallel delegations
 * to the same specialist stay unlinked until their results name their namespaces (ALF-DEC-008 keeps
 * the native `tasks` mode out), and each resolved pair can make the remaining ones unambiguous. An
 * invocation paired with a delegation that already ended ends with it.
 */
export function linkPending<S extends StepState>(state: S): S {
  let next = state;
  for (;;) {
    const pair = uniquePair(next);
    if (pair === null) return next;
    const linked = linkDelegation(next, pair.delegationId, pair.subagentId, 'guess');
    if (linked === next) return next;
    const delegation = linked.activities[pair.delegationId];
    next =
      delegation === undefined || delegation.status === 'running'
        ? linked
        : settleSubagent(
            linked,
            pair.subagentId,
            delegation.status,
            delegation.finishedAt ?? delegation.startedAt,
          );
  }
}

function uniquePair(
  state: StepState,
): { readonly delegationId: string; readonly subagentId: string } | null {
  const delegations = unresolvedDelegations(state);
  if (delegations.length === 0) return null;
  const unlinked = Object.values(state.subagents).filter(
    (subagent) => subagent.delegationId === null,
  );
  for (const subagent of unlinked) {
    if (subagent.status !== 'running' || subagent.name === null) continue;
    // Two candidates already make the invocation ambiguous: stop counting there.
    const owners = candidates(delegations, subagent, true, 2);
    const owner = owners[0];
    if (owners.length !== 1 || owner === undefined) continue;
    if (!ownsOneInvocation(unlinked, owner)) continue;
    return { delegationId: owner.id, subagentId: subagent.id };
  }
  return null;
}

/**
 * A delegation whose result names a namespace no recorded invocation ran in (its steps did not
 * fit, or none streamed) owns nothing recorded: it is resolved and never paired by inference.
 */
export function resolveWithoutInvocation<S extends StepState>(state: S, delegationId: string): S {
  const delegation = state.activities[delegationId];
  if (delegation === undefined || delegation.subagentId !== undefined) return state;
  return {
    ...state,
    activities: { ...state.activities, [delegationId]: { ...delegation, link: 'exact' } },
  };
}

/**
 * Binds a delegation to a specialist invocation. A confirmed link displaces an inferred one; the
 * displaced partners are re-paired only when that is unambiguous.
 */
export function linkDelegation<S extends StepState>(
  state: S,
  delegationId: string,
  subagentId: string,
  link: 'guess' | 'exact',
): S {
  const delegation = state.activities[delegationId];
  const subagent = state.subagents[subagentId];
  if (delegation === undefined || subagent === undefined) return state;
  if (delegation.subagentId === subagentId) {
    if (delegation.link === link) return state;
    return {
      ...state,
      activities: { ...state.activities, [delegationId]: { ...delegation, link } },
    };
  }
  if (link === 'guess' && delegation.link === 'exact') return state;
  const activities: Record<string, StoredActivity> = { ...state.activities };
  const subagents: Record<string, ProjectionSubagent> = { ...state.subagents };
  const displacedDelegation = subagent.delegationId;
  const displacedSubagent = delegation.subagentId;
  if (displacedDelegation !== null && displacedDelegation !== delegationId) {
    const { subagentId: _s, link: _l, ...rest } = activities[displacedDelegation]!;
    void _s;
    void _l;
    activities[displacedDelegation] = rest;
  }
  if (displacedSubagent !== undefined && displacedSubagent !== subagentId) {
    subagents[displacedSubagent] = { ...subagents[displacedSubagent]!, delegationId: null };
  }
  activities[delegationId] = { ...delegation, subagentId, link };
  subagents[subagentId] = { ...subagent, delegationId };
  const next: S = { ...state, activities, subagents };
  const displaced =
    (displacedSubagent !== undefined && displacedSubagent !== subagentId) ||
    (displacedDelegation !== null && displacedDelegation !== delegationId);
  return displaced ? linkPending(next) : next;
}

/** A delegation ended: its invocation ends with it and its unfinished tools are interrupted. */
export function settleSubagent<S extends StepState>(
  state: S,
  subagentId: string,
  status: ActivityStatus,
  at: number,
): S {
  const subagent = state.subagents[subagentId];
  if (subagent === undefined || subagent.status !== 'running') return state;
  const activities = Object.fromEntries(
    Object.entries(state.activities).map(([id, activity]) =>
      activity.subagentId === subagentId && activity.status === 'running'
        ? [id, { ...activity, status: 'interrupted' as const, finishedAt: at }]
        : [id, activity],
    ),
  );
  return {
    ...state,
    activities,
    subagents: { ...state.subagents, [subagentId]: { ...subagent, status, finishedAt: at } },
  };
}
