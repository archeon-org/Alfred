import type { ExecutionWork, WorkStep } from '@alfred/contracts';

import type { ChatDisplay } from '@/lib/workspace/chat-preferences';

type Filters = Pick<
  ChatDisplay,
  | 'orchestratorReasoning'
  | 'orchestratorMessages'
  | 'orchestratorTools'
  | 'emptyGenerations'
  | 'specialistReasoning'
  | 'specialistMessages'
  | 'specialistTools'
>;

/** Whether a person chose to see this step; a step owned by a specialist has a parent. */
function shown(step: WorkStep, filters: Filters): boolean {
  const specialist = step.parentId !== undefined;
  switch (step.kind) {
    case 'reasoning':
      return specialist ? filters.specialistReasoning : filters.orchestratorReasoning;
    case 'message':
      return specialist ? filters.specialistMessages : filters.orchestratorMessages;
    case 'tool':
      return specialist ? filters.specialistTools : filters.orchestratorTools;
    case 'generation':
      return filters.emptyGenerations;
    case 'delegation':
    case 'subagent':
      return true;
  }
}

/**
 * The steps a person chose to see. Specialists themselves always show; hiding only drops rows
 * from the display: the counts of the header still describe the whole work, and nothing is
 * removed from what the API recorded.
 */
export function visibleWork(work: ExecutionWork, filters: Filters): ExecutionWork {
  if (work.steps.every((step) => shown(step, filters))) return work;
  return { ...work, steps: work.steps.filter((step) => shown(step, filters)) };
}

/**
 * One line naming what is happening now, while the log is folded: the latest running step, a
 * specialist's own step before the delegation it belongs to. Null when nothing runs.
 */
export function currentActivity(work: ExecutionWork): string | null {
  const byId = new Map(work.steps.map((step) => [step.id, step]));
  for (let index = work.steps.length - 1; index >= 0; index -= 1) {
    const step = work.steps[index]!;
    if (step.status !== 'running') continue;
    const owner = step.parentId === undefined ? undefined : byId.get(step.parentId)?.specialist;
    const what = describe(step);
    return owner === undefined ? what : `${owner} · ${what}`;
  }
  return null;
}

function describe(step: WorkStep): string {
  switch (step.kind) {
    case 'reasoning':
      return 'réflexion';
    case 'message':
      return 'rédaction';
    case 'generation':
      return 'génération';
    case 'tool':
      return step.label === 'task' ? 'délégation' : step.label;
    case 'delegation':
    case 'subagent':
      return step.specialist ?? 'délégation';
  }
}
