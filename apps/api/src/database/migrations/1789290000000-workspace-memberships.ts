import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkspaceMemberships1789290000000 implements MigrationInterface {
  name = 'WorkspaceMemberships1789290000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE "api_users", "api_workspaces" IN ACCESS EXCLUSIVE MODE');
    await queryRunner.query(`CREATE TABLE "api_workspace_memberships" (
      "tenant_id" uuid NOT NULL,
      "user_id" uuid NOT NULL,
      "workspace_id" uuid NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "pk_workspace_memberships" PRIMARY KEY ("user_id", "workspace_id"),
      CONSTRAINT "fk_workspace_memberships_user" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "api_users"("tenant_id", "id") ON DELETE CASCADE,
      CONSTRAINT "fk_workspace_memberships_workspace" FOREIGN KEY ("tenant_id", "workspace_id") REFERENCES "api_workspaces"("tenant_id", "id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(
      'CREATE INDEX "idx_workspace_memberships_workspace" ON "api_workspace_memberships" ("tenant_id", "workspace_id")',
    );
    await queryRunner.query(
      'INSERT INTO "api_workspace_memberships" ("tenant_id", "user_id", "workspace_id") SELECT "tenant_id", "id", "workspace_id" FROM "api_users"',
    );
    await queryRunner.query('ALTER TABLE "api_users" DROP CONSTRAINT "fk_users_workspace"');
    await queryRunner.query('DROP INDEX "idx_users_workspace"');
    await queryRunner.query('ALTER TABLE "api_users" DROP COLUMN "workspace_id"');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'LOCK TABLE "api_users", "api_workspaces", "api_workspace_memberships" IN ACCESS EXCLUSIVE MODE',
    );
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (
        SELECT u."id" FROM "api_users" u LEFT JOIN "api_workspace_memberships" m
          ON m."user_id" = u."id" AND m."tenant_id" = u."tenant_id"
        GROUP BY u."id" HAVING count(m."workspace_id") <> 1
      ) THEN
        RAISE EXCEPTION 'Workspace membership rollback requires exactly one membership per user';
      END IF;
    END $$`);
    await queryRunner.query('ALTER TABLE "api_users" ADD COLUMN "workspace_id" uuid');
    await queryRunner.query(
      'UPDATE "api_users" u SET "workspace_id" = m."workspace_id" FROM "api_workspace_memberships" m WHERE m."user_id" = u."id" AND m."tenant_id" = u."tenant_id"',
    );
    await queryRunner.query('ALTER TABLE "api_users" ALTER COLUMN "workspace_id" SET NOT NULL');
    await queryRunner.query(
      'ALTER TABLE "api_users" ADD CONSTRAINT "fk_users_workspace" FOREIGN KEY ("tenant_id", "workspace_id") REFERENCES "api_workspaces"("tenant_id", "id") ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_users_workspace" ON "api_users" ("tenant_id", "workspace_id")',
    );
    await queryRunner.query('DROP TABLE "api_workspace_memberships"');
  }
}
