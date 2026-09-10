import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Product-owned skill packages. Explicit migration only; application startup never runs DDL. */
export class CreateSkills1789240000000 implements MigrationInterface {
  name = 'CreateSkills1789240000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "api_skills" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "tenant_id" uuid NOT NULL, "owner_user_id" uuid NOT NULL,
      "name" varchar(64) NOT NULL, "description" varchar(1024) NOT NULL,
      "version" integer NOT NULL, "current_version" integer NOT NULL, "published_version" integer,
      "file_count" integer NOT NULL, "total_bytes" integer NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "pk_skills" PRIMARY KEY ("id"),
      CONSTRAINT "fk_skills_owner" FOREIGN KEY ("tenant_id","owner_user_id") REFERENCES "api_users" ("tenant_id","id") ON DELETE CASCADE,
      CONSTRAINT "chk_skills_versions" CHECK ("version" > 0 AND "current_version" > 0 AND "current_version" <= "version" AND ("published_version" IS NULL OR ("published_version" > 0 AND "published_version" <= "current_version"))),
      CONSTRAINT "chk_skills_sizes" CHECK ("file_count" BETWEEN 1 AND 50 AND "total_bytes" BETWEEN 1 AND 1048576)
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_skills_owner_name" ON "api_skills" ("tenant_id","owner_user_id","name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_skills_owner_list" ON "api_skills" ("tenant_id","owner_user_id","created_at" DESC,"id" DESC)`,
    );
    await queryRunner.query(`CREATE TABLE "api_skill_versions" (
      "skill_id" uuid NOT NULL, "version" integer NOT NULL,
      "name" varchar(64) NOT NULL, "description" varchar(1024) NOT NULL,
      "content_hash" varchar(64) NOT NULL, "total_bytes" integer NOT NULL, "published_at" timestamptz,
      CONSTRAINT "pk_skill_versions" PRIMARY KEY ("skill_id","version"),
      CONSTRAINT "fk_skill_versions_skill" FOREIGN KEY ("skill_id") REFERENCES "api_skills" ("id") ON DELETE CASCADE,
      CONSTRAINT "chk_skill_versions_number" CHECK ("version" > 0)
    )`);
    await queryRunner.query(`CREATE TABLE "api_skill_files" (
      "skill_id" uuid NOT NULL, "version" integer NOT NULL, "path" varchar(240) NOT NULL,
      "content" bytea NOT NULL, "media_type" varchar(127) NOT NULL, "size_bytes" integer NOT NULL,
      CONSTRAINT "pk_skill_files" PRIMARY KEY ("skill_id","version","path"),
      CONSTRAINT "fk_skill_files_version" FOREIGN KEY ("skill_id","version") REFERENCES "api_skill_versions" ("skill_id","version") ON DELETE CASCADE,
      CONSTRAINT "chk_skill_files_size" CHECK ("size_bytes" = octet_length("content") AND "size_bytes" BETWEEN 0 AND 1048576)
    )`);
    await queryRunner.query(`CREATE TABLE "api_conversation_skills" (
      "conversation_id" uuid NOT NULL, "skill_id" uuid NOT NULL,
      CONSTRAINT "pk_conversation_skills" PRIMARY KEY ("conversation_id","skill_id"),
      CONSTRAINT "fk_conversation_skills_skill" FOREIGN KEY ("skill_id") REFERENCES "api_skills" ("id") ON DELETE CASCADE,
      CONSTRAINT "fk_conversation_skills_conversation" FOREIGN KEY ("conversation_id") REFERENCES "api_conversations" ("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(
      `CREATE INDEX "idx_conversation_skills_skill" ON "api_conversation_skills" ("skill_id")`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    // Serialize the emptiness check against concurrent CRUD before destructive rollback.
    await queryRunner.query('LOCK TABLE "api_skills" IN ACCESS EXCLUSIVE MODE');
    const rows: unknown = await queryRunner.query('SELECT 1 FROM "api_skills" LIMIT 1');
    if (Array.isArray(rows) && rows.length > 0)
      throw new Error(
        'Cannot revert skills migration while authored skills exist. Export and remove them explicitly first.',
      );
    await queryRunner.query('DROP TABLE "api_conversation_skills"');
    await queryRunner.query('DROP TABLE "api_skill_files"');
    await queryRunner.query('DROP TABLE "api_skill_versions"');
    await queryRunner.query('DROP TABLE "api_skills"');
  }
}
