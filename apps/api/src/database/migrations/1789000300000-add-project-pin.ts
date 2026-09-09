import type { MigrationInterface, QueryRunner } from 'typeorm';

// A pinned project keeps the moment it was pinned so the pinned list follows that order.
// The partial index serves the owner's pinned list without touching unpinned rows.
export class AddProjectPin1789000300000 implements MigrationInterface {
  name = 'AddProjectPin1789000300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "api_projects" ADD COLUMN "pinned_at" timestamptz');
    await queryRunner.query(`
      CREATE INDEX "idx_projects_pinned" ON "api_projects"
        ("tenant_id", "owner_user_id", "pinned_at", "id")
        WHERE "pinned_at" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "idx_projects_pinned"');
    await queryRunner.query('ALTER TABLE "api_projects" DROP COLUMN IF EXISTS "pinned_at"');
  }
}
