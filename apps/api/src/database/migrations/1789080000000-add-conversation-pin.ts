import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConversationPin1789080000000 implements MigrationInterface {
  readonly name = 'AddConversationPin1789080000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "api_conversations" ADD COLUMN "pinned_at" timestamptz');
    await queryRunner.query(`CREATE INDEX "idx_conversations_pinned_list" ON "api_conversations"
      ("project_id", ("pinned_at" IS NOT NULL) DESC, "created_at" DESC, "id" DESC)
      WHERE "archived_at" IS NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "idx_conversations_pinned_list"');
    await queryRunner.query('ALTER TABLE "api_conversations" DROP COLUMN "pinned_at"');
  }
}
