import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContextDocuments1789160000000 implements MigrationInterface {
  readonly name = 'CreateContextDocuments1789160000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "api_context_documents" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "user_id" uuid, "project_id" uuid,
      "kind" varchar(16) NOT NULL, "content" text NOT NULL,
      "revision" integer NOT NULL, "content_hash" varchar(64) NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "pk_context_documents" PRIMARY KEY ("id"),
      CONSTRAINT "chk_context_parent" CHECK (("user_id" IS NOT NULL AND "project_id" IS NULL) OR ("user_id" IS NULL AND "project_id" IS NOT NULL)),
      CONSTRAINT "chk_context_kind" CHECK (("user_id" IS NOT NULL AND "kind" IN ('instructions', 'preferences')) OR ("project_id" IS NOT NULL AND "kind" IN ('context', 'preferences'))),
      CONSTRAINT "chk_context_size" CHECK (octet_length("content") <= 65536),
      CONSTRAINT "chk_context_revision" CHECK ("revision" > 0),
      CONSTRAINT "fk_context_user" FOREIGN KEY ("user_id") REFERENCES "api_users"("id") ON DELETE CASCADE,
      CONSTRAINT "fk_context_project" FOREIGN KEY ("project_id") REFERENCES "api_projects"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_context_user_kind" ON "api_context_documents" ("user_id", "kind") WHERE "user_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_context_project_kind" ON "api_context_documents" ("project_id", "kind") WHERE "project_id" IS NOT NULL`,
    );
    // PostgreSQL's core sha256(bytea) needs no extension and preserves legacy text byte-for-byte.
    await queryRunner.query(
      `INSERT INTO "api_context_documents" ("project_id", "kind", "content", "revision", "content_hash", "created_at", "updated_at") SELECT "id", 'context', "context", 1, encode(sha256(convert_to("context", 'UTF8')), 'hex'), "created_at", "updated_at" FROM "api_projects" WHERE "context" IS NOT NULL`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    // Refuse a destructive downgrade when there is no legacy field able to retain the content.
    await queryRunner.query(
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM "api_context_documents" WHERE ("user_id" IS NOT NULL OR "kind" = 'preferences') AND "content" <> '') THEN RAISE EXCEPTION 'Export personal context and project preferences before reverting context documents'; END IF; END $$`,
    );
    await queryRunner.query(
      `UPDATE "api_projects" p SET "context" = NULLIF(d."content", '') FROM "api_context_documents" d WHERE d."project_id" = p."id" AND d."kind" = 'context'`,
    );
    await queryRunner.query('DROP TABLE "api_context_documents"');
  }
}
