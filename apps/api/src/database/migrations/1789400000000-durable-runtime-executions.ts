import type { MigrationInterface, QueryRunner } from 'typeorm';

/** ALF-DEC-006/007/032/033: durable intent, native-source projection and fenced recovery. */
export class DurableRuntimeExecutions1789400000000 implements MigrationInterface {
  name = 'DurableRuntimeExecutions1789400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "api_runtime_threads"
      ADD "generation" uuid NOT NULL DEFAULT gen_random_uuid()`);
    await queryRunner.query(`ALTER TABLE "api_executions"
      DROP CONSTRAINT "chk_executions_status",
      ALTER COLUMN "status" TYPE varchar(32),
      ADD "owner_user_id" uuid, ADD "tenant_id" uuid, ADD "project_id" uuid,
      ADD "submission_id" uuid, ADD "submission_hash" varchar(64),
      ADD "response_profile" varchar(96), ADD "invocation_id" uuid,
      ADD "binding_generation" uuid,
      ADD "dispatch_state" varchar(16) NOT NULL DEFAULT 'pending',
      ADD "stop_requested_at" timestamptz, ADD "deadline_at" timestamptz,
      ADD "lease_owner" varchar(128), ADD "lease_version" integer NOT NULL DEFAULT 0,
      ADD "lease_expires_at" timestamptz, ADD "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
      ADD "source_watermark" varchar(256), ADD "projection_revision" integer NOT NULL DEFAULT 0,
      ADD "reducer_state" jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD "public_text" text NOT NULL DEFAULT '', ADD "title_requested" boolean NOT NULL DEFAULT false`);
    // Old in-flight work must never be silently declared failed or dispatched again.
    await queryRunner.query(`UPDATE "api_executions" e SET
      "owner_user_id" = p."owner_user_id", "tenant_id" = p."tenant_id", "project_id" = p."id",
      "submission_id" = e."id", "submission_hash" = repeat('0', 64), "response_profile" = 'legacy',
      "invocation_id" = gen_random_uuid(), "binding_generation" = COALESCE(t."generation", gen_random_uuid()),
      "deadline_at" = e."created_at" + interval '10 minutes',
      "dispatch_state" = CASE WHEN e."runtime_run_id" IS NULL THEN 'unknown' ELSE 'accepted' END,
      "status" = CASE WHEN e."status" IN ('pending', 'running') THEN 'recovery_required' ELSE e."status" END
      FROM "api_conversations" c JOIN "api_projects" p ON p."id" = c."project_id"
      LEFT JOIN "api_runtime_threads" t ON t."conversation_id" = c."id"
      WHERE e."conversation_id" = c."id"`);
    await queryRunner.query(`ALTER TABLE "api_executions"
      ALTER COLUMN "owner_user_id" SET NOT NULL, ALTER COLUMN "tenant_id" SET NOT NULL,
      ALTER COLUMN "project_id" SET NOT NULL, ALTER COLUMN "submission_id" SET NOT NULL,
      ALTER COLUMN "submission_hash" SET NOT NULL, ALTER COLUMN "response_profile" SET NOT NULL,
      ALTER COLUMN "invocation_id" SET NOT NULL, ALTER COLUMN "binding_generation" SET NOT NULL,
      ALTER COLUMN "deadline_at" SET NOT NULL,
      ADD CONSTRAINT "chk_executions_counters" CHECK ("lease_version" >= 0 AND "projection_revision" >= 0),
      ADD CONSTRAINT "chk_executions_dispatch_state" CHECK ("dispatch_state" IN ('pending', 'dispatching', 'accepted', 'unknown')),
      ADD CONSTRAINT "chk_executions_status" CHECK ("status" IN
        ('pending','running','recovering','stopping','interrupted','recovery_required','completed','failed','cancelled','timed_out'))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_executions_submission"
      ON "api_executions" ("conversation_id", "submission_id")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_executions_invocation" ON "api_executions" ("invocation_id")`,
    );
    // A conflicting historical active set makes migration fail for explicit operator reconciliation.
    // Parked rows with a confirmed native end (finished_at set) release the reservation.
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_executions_active_conversation"
      ON "api_executions" ("conversation_id") WHERE "status" IN
      ('pending','running','recovering','stopping','interrupted','recovery_required')
      AND "finished_at" IS NULL`);
    await queryRunner.query(`CREATE INDEX "idx_executions_recovery" ON "api_executions" ("next_attempt_at")
      WHERE "status" IN ('pending','running','recovering','stopping')`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_messages_execution_role"
      ON "api_messages" ("execution_id", "role") WHERE "execution_id" IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const active: unknown = await queryRunner.query(`SELECT 1 FROM "api_executions"
      WHERE "status" IN ('pending','running','recovering','stopping','interrupted','recovery_required') LIMIT 1`);
    if (!Array.isArray(active) || active.length > 0)
      throw new Error('Cannot revert durable execution schema while active executions remain.');
    await queryRunner.query('DROP INDEX "uq_messages_execution_role"');
    for (const index of [
      'idx_executions_recovery',
      'uq_executions_active_conversation',
      'uq_executions_invocation',
      'uq_executions_submission',
    ]) {
      await queryRunner.query(`DROP INDEX "${index}"`);
    }
    await queryRunner.query(
      `ALTER TABLE "api_executions" DROP CONSTRAINT "chk_executions_status", DROP CONSTRAINT "chk_executions_counters", DROP CONSTRAINT "chk_executions_dispatch_state"`,
    );
    await queryRunner.query(
      `UPDATE "api_executions" SET "status" = 'failed' WHERE "status" = 'timed_out'`,
    );
    const columns = [
      'owner_user_id',
      'tenant_id',
      'project_id',
      'submission_id',
      'submission_hash',
      'response_profile',
      'invocation_id',
      'binding_generation',
      'dispatch_state',
      'stop_requested_at',
      'deadline_at',
      'lease_owner',
      'lease_version',
      'lease_expires_at',
      'next_attempt_at',
      'source_watermark',
      'projection_revision',
      'reducer_state',
      'public_text',
      'title_requested',
    ];
    await queryRunner.query(`ALTER TABLE "api_executions" ${columns.map((name) => `DROP COLUMN "${name}"`).join(', ')},
      ALTER COLUMN "status" TYPE varchar(16), ADD CONSTRAINT "chk_executions_status"
      CHECK ("status" IN ('pending','running','completed','failed','cancelled'))`);
    await queryRunner.query('ALTER TABLE "api_runtime_threads" DROP COLUMN "generation"');
  }
}
