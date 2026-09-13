import type { MigrationInterface, QueryRunner } from 'typeorm';

// ALF-DEC-007/032/033: the product store keeps the visible transcript, one private runtime thread
// binding per conversation, and one execution row per submitted chat request. Runtime identifiers
// stay server-side; the browser only ever sees execution and message identifiers.
export class CreateRuntimeExecutions1789310000000 implements MigrationInterface {
  name = 'CreateRuntimeExecutions1789310000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "api_runtime_threads" (
        "conversation_id" uuid NOT NULL,
        "runtime" varchar(32) NOT NULL DEFAULT 'langgraph',
        "thread_id" varchar(128) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_runtime_threads" PRIMARY KEY ("conversation_id"),
        CONSTRAINT "fk_runtime_threads_conversation" FOREIGN KEY ("conversation_id")
          REFERENCES "api_conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_runtime_threads_thread" UNIQUE ("runtime", "thread_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "api_executions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "conversation_id" uuid NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "runtime_thread_id" varchar(128),
        "runtime_run_id" varchar(128),
        "error" varchar(512),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "started_at" timestamptz,
        "finished_at" timestamptz,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_executions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_executions_conversation" FOREIGN KEY ("conversation_id")
          REFERENCES "api_conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_executions_status"
          CHECK ("status" IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_executions_conversation" ON "api_executions"
        ("conversation_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE TABLE "api_messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "conversation_id" uuid NOT NULL,
        "execution_id" uuid,
        "role" varchar(16) NOT NULL,
        "content" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_messages" PRIMARY KEY ("id"),
        CONSTRAINT "fk_messages_conversation" FOREIGN KEY ("conversation_id")
          REFERENCES "api_conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_messages_execution" FOREIGN KEY ("execution_id")
          REFERENCES "api_executions"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_messages_role" CHECK ("role" IN ('user', 'assistant'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_messages_conversation_order" ON "api_messages"
        ("conversation_id", "created_at", "id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "api_messages"');
    await queryRunner.query('DROP TABLE IF EXISTS "api_executions"');
    await queryRunner.query('DROP TABLE IF EXISTS "api_runtime_threads"');
  }
}
