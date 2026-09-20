import type { Execution, ExecutionStatus } from '@alfred/contracts';

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'timed_out']);
/** Only advancing work blocks the composer; a parked answer is superseded by the next message. */
const BUSY = new Set(['pending', 'running', 'stopping']);
/**
 * Product statuses only move forward. A frame carrying an earlier stage (a queued `running`
 * after the Stop acknowledgement said `stopping`) is a stale delivery, never a regression.
 */
const STATUS_RANK: Readonly<Record<ExecutionStatus, number>> = {
  pending: 0,
  running: 1,
  recovering: 1,
  interrupted: 2,
  recovery_required: 2,
  stopping: 3,
  completed: 4,
  failed: 4,
  cancelled: 4,
  timed_out: 4,
};

export function isBusyExecution(execution: Execution | null): boolean {
  return execution === null || BUSY.has(execution.status);
}

/**
 * Terminal, or parked with a confirmed native end (`finishedAt` set on `recovery_required`). The
 * API sends such a run once and closes; there is nothing left to observe or reconnect to.
 */
export function isSettledExecution(execution: Execution): boolean {
  return TERMINAL.has(execution.status) || execution.finishedAt !== null;
}

/** True when `next` is the same stage as `current` or a later one. */
export function advances(current: Execution | null, next: Execution): boolean {
  return current === null || STATUS_RANK[next.status] >= STATUS_RANK[current.status];
}

/** A settled execution whose outcome is not a success reads as a failed turn. */
export function failedExecution(execution: Execution): boolean {
  return (
    execution.status === 'failed' ||
    execution.status === 'timed_out' ||
    (isSettledExecution(execution) &&
      execution.status !== 'completed' &&
      execution.status !== 'cancelled')
  );
}
