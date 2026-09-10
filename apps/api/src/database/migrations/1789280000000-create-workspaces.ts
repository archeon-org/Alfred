import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkspaces1789280000000 implements MigrationInterface {
  name = 'CreateWorkspaces1789280000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "api_workspaces" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "tenant_id" uuid NOT NULL,
      "slug" varchar(64) NOT NULL,
      "name" varchar(160) NOT NULL,
      "status" varchar(16) NOT NULL DEFAULT 'active',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "pk_workspaces" PRIMARY KEY ("id"),
      CONSTRAINT "uq_workspaces_tenant_id" UNIQUE ("tenant_id", "id"),
      CONSTRAINT "chk_workspaces_slug" CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
      CONSTRAINT "chk_workspaces_name" CHECK (length(btrim("name")) > 0),
      CONSTRAINT "chk_workspaces_status" CHECK ("status" IN ('active', 'archived')),
      CONSTRAINT "fk_workspaces_tenant" FOREIGN KEY ("tenant_id") REFERENCES "api_tenants"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "uq_workspaces_tenant_slug" ON "api_workspaces" ("tenant_id", "slug")',
    );
    await queryRunner.query(
      `INSERT INTO "api_workspaces" ("tenant_id", "slug", "name") SELECT "id", 'default', 'Équipe générale' FROM "api_tenants"`,
    );
    await queryRunner.query('ALTER TABLE "api_users" ADD COLUMN "workspace_id" uuid');
    await queryRunner.query(
      `UPDATE "api_users" AS u SET "workspace_id" = w."id" FROM "api_workspaces" AS w WHERE w."tenant_id" = u."tenant_id" AND w."slug" = 'default'`,
    );
    await queryRunner.query('ALTER TABLE "api_users" ALTER COLUMN "workspace_id" SET NOT NULL');
    await queryRunner.query(
      `ALTER TABLE "api_users" ADD CONSTRAINT "fk_users_workspace" FOREIGN KEY ("tenant_id", "workspace_id") REFERENCES "api_workspaces"("tenant_id", "id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      'CREATE INDEX "idx_users_workspace" ON "api_users" ("tenant_id", "workspace_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Refuse to discard teams or affiliations established after the bootstrap migration.
    await queryRunner.query('LOCK TABLE "api_workspaces", "api_users" IN ACCESS EXCLUSIVE MODE');
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM "api_workspaces" WHERE "slug" <> 'default' OR "name" <> 'Équipe générale' OR "status" <> 'active') THEN
        RAISE EXCEPTION 'Workspace rollback would discard customized workspace data';
      END IF;
    END $$`);
    await queryRunner.query('DROP INDEX "idx_users_workspace"');
    await queryRunner.query('ALTER TABLE "api_users" DROP CONSTRAINT "fk_users_workspace"');
    await queryRunner.query('ALTER TABLE "api_users" DROP COLUMN "workspace_id"');
    await queryRunner.query('DROP TABLE "api_workspaces"');
  }
}
