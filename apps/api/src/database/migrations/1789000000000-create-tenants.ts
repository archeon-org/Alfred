import type { MigrationInterface, QueryRunner } from 'typeorm';

export const DEFAULT_TENANT_SLUG = 'default';

// ALF-DEC-055: a minimal Tenant is the product data-isolation root from the first release, even
// when a deployment bootstraps exactly one tenant. Every user belongs to one tenant so that root
// records such as projects can carry a constrained (tenant_id, owner) foreign key.
export class CreateTenants1789000000000 implements MigrationInterface {
  name = 'CreateTenants1789000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "api_tenants" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug" varchar(64) NOT NULL,
        "name" varchar(160) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_tenants" PRIMARY KEY ("id"),
        CONSTRAINT "chk_tenants_slug" CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
        CONSTRAINT "chk_tenants_status" CHECK ("status" IN ('active', 'suspended'))
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "uq_tenants_slug" ON "api_tenants" ("slug")');
    await queryRunner.query(
      `INSERT INTO "api_tenants" ("slug", "name") VALUES ('${DEFAULT_TENANT_SLUG}', 'Default tenant')`,
    );
    await queryRunner.query('ALTER TABLE "api_users" ADD COLUMN "tenant_id" uuid');
    await queryRunner.query(
      `UPDATE "api_users" SET "tenant_id" = (SELECT "id" FROM "api_tenants" WHERE "slug" = '${DEFAULT_TENANT_SLUG}')`,
    );
    await queryRunner.query('ALTER TABLE "api_users" ALTER COLUMN "tenant_id" SET NOT NULL');
    await queryRunner.query(`
      ALTER TABLE "api_users"
        ADD CONSTRAINT "fk_users_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "api_tenants"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(
      'ALTER TABLE "api_users" ADD CONSTRAINT "uq_users_tenant_id" UNIQUE ("tenant_id", "id")',
    );
    await queryRunner.query('CREATE INDEX "idx_users_tenant" ON "api_users" ("tenant_id")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "idx_users_tenant"');
    await queryRunner.query(
      'ALTER TABLE "api_users" DROP CONSTRAINT IF EXISTS "uq_users_tenant_id"',
    );
    await queryRunner.query('ALTER TABLE "api_users" DROP CONSTRAINT IF EXISTS "fk_users_tenant"');
    await queryRunner.query('ALTER TABLE "api_users" DROP COLUMN IF EXISTS "tenant_id"');
    await queryRunner.query('DROP TABLE IF EXISTS "api_tenants"');
  }
}
