import { ApiException } from '../../../common/errors/api.exception';
import type { EntityManager } from 'typeorm';

/** Nonterminal states reserve the conversation even when runtime acceptance is uncertain. */
export const ACTIVE_EXECUTION_STATUSES = [
  'pending',
  'running',
  'recovering',
  'stopping',
  'interrupted',
  'recovery_required',
] as const;
export const TERMINAL_EXECUTION_STATUSES = [
  'completed',
  'failed',
  'cancelled',
  'timed_out',
] as const;
export const EXECUTION_DEADLINE_MS = 10 * 60 * 1000;
export const EXECUTION_LEASE_MS = 30_000;
export const EXECUTION_RETRY_MS = 2_000;
export const EXECUTION_RETRY_MAX_MS = 60_000;

/**
 * Retry delay after a released claim. The lease version counts claims, so an execution that keeps
 * failing to progress backs off exponentially without ever inventing a native outcome.
 */
export function retryDelayMs(claims: number): number {
  const exponent = Math.min(Math.max(0, Math.floor(claims) - 1), 30);
  return Math.min(EXECUTION_RETRY_MS * 2 ** exponent, EXECUTION_RETRY_MAX_MS);
}

/**
 * A row is settled once its outcome is known: terminal, or parked with a confirmed native end
 * (`finishedAt` set on `recovery_required`). Settled rows no longer reserve their conversation.
 */
export function isExecutionSettled(row: {
  readonly status: string;
  readonly finishedAt: Date | null;
}): boolean {
  return (
    (TERMINAL_EXECUTION_STATUSES as readonly string[]).includes(row.status) ||
    row.finishedAt !== null
  );
}

/** States in which a worker is actually advancing native work. */
export const BUSY_EXECUTION_STATUSES = ['pending', 'running', 'stopping'] as const;
/** A transient `recovering` row keeps the conversation for this long before a new message may replace it. */
export const RECOVERING_GRACE_MS = 30_000;
/** Progress commit window: time or bytes of new text, whichever comes first. */
export const PROGRESS_COMMIT_INTERVAL_MS = 500;
export const PROGRESS_COMMIT_BYTES = 4_096;

/**
 * A conversation is busy only while its execution is genuinely advancing within its deadline:
 * dispatching, streaming, stopping, or briefly recovering from a transient runtime failure. Parked
 * (`interrupted`, `recovery_required`) and stalled rows may be superseded by a new message.
 */
export function isExecutionBusy(
  row: {
    readonly status: string;
    readonly finishedAt: Date | null;
    readonly deadlineAt: Date;
    readonly updatedAt: Date;
  },
  now = new Date(),
): boolean {
  if (row.finishedAt !== null || row.deadlineAt.getTime() <= now.getTime()) return false;
  if ((BUSY_EXECUTION_STATUSES as readonly string[]).includes(row.status)) return true;
  return (
    row.status === 'recovering' && row.updatedAt.getTime() + RECOVERING_GRACE_MS > now.getTime()
  );
}

/** SQL predicate matching `isExecutionBusy`, for guards that run inside a locked transaction. */
export const BUSY_EXECUTION_SQL = `"finished_at" IS NULL AND "deadline_at" > clock_timestamp()
  AND ("status" = ANY($2::varchar[])
    OR ("status" = 'recovering' AND "updated_at" > clock_timestamp() - ($3::int * interval '1 millisecond')))`;

export interface ExecutionFence {
  readonly id: string;
  readonly invocationId: string;
  readonly bindingGeneration: string;
  readonly leaseOwner: string | null;
  readonly leaseVersion: number;
}

/** Only busy work blocks deletion or transfer; parked or stalled rows never hold a resource. */
export async function assertNoActiveExecutions(
  manager: EntityManager,
  conversationIds: readonly string[],
): Promise<void> {
  if (conversationIds.length === 0) return;
  const rows: unknown[] = await manager.query(
    `SELECT 1 FROM "api_executions" WHERE "conversation_id" = ANY($1::uuid[])
       AND ${BUSY_EXECUTION_SQL} LIMIT 1`,
    [conversationIds, BUSY_EXECUTION_STATUSES, RECOVERING_GRACE_MS],
  );
  if (rows.length > 0) {
    throw new ApiException(
      409,
      'thread_busy',
      'Stop the active execution before changing this resource.',
    );
  }
}
