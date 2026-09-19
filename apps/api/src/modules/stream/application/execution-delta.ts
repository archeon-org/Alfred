import type { ExecutionDelta, ExecutionSnapshot } from '@alfred/contracts';

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/**
 * Wire-efficient difference between two consecutive public snapshots of one execution. Text that
 * only grew travels as an append; any other change travels as a replacement. Unchanged activity,
 * execution and conversation fields are omitted.
 */
export function executionDelta(
  previous: ExecutionSnapshot,
  next: ExecutionSnapshot,
): ExecutionDelta {
  const grew = next.assistantText.startsWith(previous.assistantText);
  const append = grew ? next.assistantText.slice(previous.assistantText.length) : '';
  return {
    executionId: next.execution.id,
    baseRevision: previous.revision,
    revision: next.revision,
    cursor: next.cursor,
    ...(grew
      ? append === ''
        ? {}
        : { assistantAppend: append }
      : { assistantText: next.assistantText }),
    ...(same(previous.activities, next.activities) ? {} : { activities: next.activities }),
    ...(same(previous.execution, next.execution) ? {} : { execution: next.execution }),
    ...(same(previous.conversation, next.conversation) ? {} : { conversation: next.conversation }),
  };
}
