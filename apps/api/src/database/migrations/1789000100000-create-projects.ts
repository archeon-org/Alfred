import type { MigrationInterface, QueryRunner } from 'typeorm';

// ALF-DEC-002/004/034/055: a project is the durable ownership, authorization and shared-context
// boundary inside one tenant, with exactly one human owner. `kind = 'implicit'` is the private
// container created for a standalone "New chat"; it stays hidden from the project list until it
// is promoted. Tenant identity is preserved through the composite owner foreign key rather than an
// unvalidated copy of `tenant_id`.
export class CreateProjects1789000100000 implements MigrationInterface {
  name = 'CreateProjects1789000100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "api_projects" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "kind" varchar(8) NOT NULL,
        "name" varchar(160),
        "description" varchar(2000),
        "context" text,
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "archived_at" timestamptz,
        CONSTRAINT "pk_projects" PRIMARY KEY ("id"),
        CONSTRAINT "fk_projects_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "api_tenants"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_projects_owner" FOREIGN KEY ("tenant_id", "owner_user_id")
          REFERENCES "api_users"("tenant_id", "id") ON DELETE CASCADE,
        CONSTRAINT "chk_projects_kind" CHECK ("kind" IN ('implicit', 'named')),
        CONSTRAINT "chk_projects_name" CHECK ("kind" = 'implicit' OR "name" IS NOT NULL),
        CONSTRAINT "chk_projects_status" CHECK ("status" IN ('active', 'archived', 'deleting')),
        CONSTRAINT "chk_projects_context_size" CHECK ("context" IS NULL OR octet_length("context") <= 65536)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_projects_owner_list" ON "api_projects"
        ("tenant_id", "owner_user_id", "kind", "status", "updated_at" DESC, "id" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "api_projects"');
  }
}
