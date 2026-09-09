import type { MigrationInterface, QueryRunner } from 'typeorm';

// ALF-DEC-002/007/034: a conversation is the stable user-facing chat resource and belongs to exactly
// one project for its whole lifetime. It carries no runtime thread identifier; runtime bindings are
// private, replaceable and delivered by the later runtime bridge.
export class CreateConversations1789000200000 implements MigrationInterface {
  name = 'CreateConversations1789000200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "api_conversations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL,
        "title" varchar(160) NOT NULL DEFAULT 'Nouvelle conversation',
        "title_source" varchar(8) NOT NULL DEFAULT 'none',
        "last_activity_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "archived_at" timestamptz,
        CONSTRAINT "pk_conversations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_conversations_project" FOREIGN KEY ("project_id")
          REFERENCES "api_projects"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_conversations_title_source" CHECK ("title_source" IN ('none', 'auto', 'user'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_conversations_project_list" ON "api_conversations"
        ("project_id", "created_at" DESC, "id" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "api_conversations"');
  }
}
