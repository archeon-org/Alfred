import { executionStatusSchema, type ExecutionWorkSummary } from '@alfred/contracts';
import type { DataSource } from 'typeorm';

interface SummaryRow {
  readonly id: string;
  readonly status: string;
  readonly startedAt: Date | string | null;
  readonly finishedAt: Date | string | null;
  readonly steps: number | string | null;
  readonly tools: number | string | null;
  readonly delegations: number | string | null;
  readonly failedSteps: number | string | null;
}

const ACTIVITIES = `CASE WHEN jsonb_typeof(e."reducer_state"->'activities') = 'object'
  THEN e."reducer_state"->'activities' ELSE '{}'::jsonb END`;
const KIND = `COALESCE(a.value->>'kind', CASE WHEN a.value->>'label' = 'task' THEN 'delegation' ELSE 'tool' END)`;

/**
 * Counts the work behind each execution inside PostgreSQL: the reducer JSON never leaves the
 * database for a transcript listing, whatever its size.
 */
const SUMMARY_SQL = `SELECT e."id", e."status", e."started_at" AS "startedAt", e."finished_at" AS "finishedAt",
  CASE WHEN jsonb_typeof(e."reducer_state"->'order') = 'array'
    THEN jsonb_array_length(e."reducer_state"->'order')
    ELSE (SELECT count(*) FROM jsonb_each(${ACTIVITIES}) a) END
    + COALESCE(NULLIF(e."reducer_state"->>'omittedSteps', '')::int, 0) AS "steps",
  (SELECT count(*) FROM jsonb_each(${ACTIVITIES}) a WHERE ${KIND} = 'tool') AS "tools",
  (SELECT count(*) FROM jsonb_each(${ACTIVITIES}) a WHERE ${KIND} = 'delegation') AS "delegations",
  (SELECT count(*) FROM jsonb_each(${ACTIVITIES}) a
     WHERE a.value->>'status' IN ('failed', 'interrupted')) AS "failedSteps"
FROM "api_executions" e WHERE e."id" = ANY($1::uuid[])`;

function count(value: number | string | null): number {
  const parsed = typeof value === 'string' ? Number(value) : (value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function moment(value: Date | string | null): number | null {
  if (value === null) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/** Work summaries of the given executions, keyed by execution id; unknown ids are absent. */
export async function loadWorkSummaries(
  dataSource: DataSource,
  executionIds: readonly string[],
): Promise<ReadonlyMap<string, ExecutionWorkSummary>> {
  const ids = [...new Set(executionIds)];
  if (ids.length === 0) return new Map();
  const rows = await dataSource.query<SummaryRow[]>(SUMMARY_SQL, [ids]);
  const summaries = new Map<string, ExecutionWorkSummary>();
  for (const row of rows) {
    const status = executionStatusSchema.safeParse(row.status);
    if (!status.success) continue;
    const startedAt = moment(row.startedAt);
    const finishedAt = moment(row.finishedAt);
    const durationMs =
      startedAt === null || finishedAt === null ? null : Math.max(0, finishedAt - startedAt);
    summaries.set(row.id, {
      status: status.data,
      durationMs,
      steps: count(row.steps),
      tools: count(row.tools),
      delegations: count(row.delegations),
      failedSteps: count(row.failedSteps),
    });
  }
  return summaries;
}
