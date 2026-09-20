import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ExecutionFence } from '../../domain/execution-lifecycle';
import { ExecutionEntity } from './execution.entity';

export const FENCE_SQL = `"id" = $1 AND "invocation_id" = $2 AND "binding_generation" = $3
  AND "lease_owner" = $4 AND "lease_version" = $5
  AND "lease_expires_at" > clock_timestamp()`;

export function fenceValues(fence: ExecutionFence): readonly unknown[] {
  return [
    fence.id,
    fence.invocationId,
    fence.bindingGeneration,
    fence.leaseOwner,
    fence.leaseVersion,
  ];
}

@Injectable()
export class ExecutionLeaseStore {
  constructor(private readonly dataSource: DataSource) {}

  async claim(owner: string, leaseMs: number): Promise<ExecutionEntity | null> {
    const rows: { id: string; lease_version: number }[] = await this.dataSource.query(
      `WITH candidate AS (
        SELECT "id" FROM "api_executions"
        WHERE ("status" IN ('pending', 'running', 'recovering', 'stopping')
          OR ("status" = 'recovery_required' AND "finished_at" IS NULL AND "response_profile" <> 'legacy')
          OR ("status" IN ('interrupted', 'recovery_required') AND "finished_at" IS NULL
            AND "deadline_at" <= clock_timestamp()))
          AND "next_attempt_at" <= clock_timestamp()
          AND ("lease_expires_at" IS NULL OR "lease_expires_at" <= clock_timestamp())
        ORDER BY "next_attempt_at", "created_at" FOR UPDATE SKIP LOCKED LIMIT 1
      ), claimed AS (UPDATE "api_executions" e SET "lease_owner" = $1,
          "lease_version" = e."lease_version" + 1,
          "lease_expires_at" = clock_timestamp() + $2 * interval '1 millisecond'
        FROM candidate WHERE e."id" = candidate."id" RETURNING e."id", e."lease_version") SELECT "id", "lease_version" FROM claimed`,
      [owner, leaseMs],
    );
    const claimed = rows[0];
    return claimed === undefined
      ? null
      : this.dataSource
          .getRepository(ExecutionEntity)
          .findOneBy({ id: claimed.id, leaseOwner: owner, leaseVersion: claimed.lease_version });
  }

  async renew(fence: ExecutionFence, leaseMs: number): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      `WITH renewed AS (UPDATE "api_executions" SET "lease_expires_at" = clock_timestamp() + $6 * interval '1 millisecond'
        WHERE ${FENCE_SQL} RETURNING "id") SELECT "id" FROM renewed`,
      [...fenceValues(fence), leaseMs],
    );
    return rows.length === 1;
  }

  async release(fence: ExecutionFence, retryMs: number): Promise<void> {
    await this.dataSource.query(
      `UPDATE "api_executions" SET "lease_owner" = NULL, "lease_expires_at" = NULL,
        "next_attempt_at" = clock_timestamp() + $6 * interval '1 millisecond'
        WHERE ${FENCE_SQL}`,
      [...fenceValues(fence), retryMs],
    );
  }
}
