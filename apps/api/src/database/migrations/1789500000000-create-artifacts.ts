import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The personal file library (ADR 0028; ALF-DEC-002, ALF-DEC-013 `/user`, ALF-DEC-025, ALF-DEC-054).
 * PostgreSQL holds every piece of metadata, the extracted text and the quota ledger; the bytes
 * live behind the content store under the opaque `api_artifact_contents.id`.
 */
export class CreateArtifacts1789500000000 implements MigrationInterface {
  name = 'CreateArtifacts1789500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "api_artifact_folders" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "tenant_id" uuid NOT NULL,
      "owner_user_id" uuid NOT NULL,
      "parent_id" uuid,
      "name" varchar(120) NOT NULL,
      "name_key" varchar(120) NOT NULL,
      "depth" smallint NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "pk_artifact_folders" PRIMARY KEY ("id"),
      CONSTRAINT "chk_artifact_folders_name" CHECK (length(btrim("name")) > 0),
      CONSTRAINT "chk_artifact_folders_depth" CHECK ("depth" BETWEEN 1 AND 8),
      CONSTRAINT "chk_artifact_folders_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
      CONSTRAINT "fk_artifact_folders_owner" FOREIGN KEY ("tenant_id", "owner_user_id") REFERENCES "api_users"("tenant_id", "id") ON DELETE CASCADE,
      CONSTRAINT "fk_artifact_folders_parent" FOREIGN KEY ("parent_id") REFERENCES "api_artifact_folders"("id") ON DELETE RESTRICT
    )`);
    // Two folders of one parent never share a name, the top level included (NULL parent).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_artifact_folders_sibling" ON "api_artifact_folders" ("tenant_id", "owner_user_id", "parent_id", "name_key") NULLS NOT DISTINCT`,
    );
    await queryRunner.query(
      'CREATE INDEX "idx_artifact_folders_parent" ON "api_artifact_folders" ("parent_id")',
    );

    // Bytes outside PostgreSQL must never be orphaned by a row cascade: the owner FK restricts.
    await queryRunner.query(`CREATE TABLE "api_artifact_contents" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "tenant_id" uuid NOT NULL,
      "owner_user_id" uuid NOT NULL,
      "role" varchar(12) NOT NULL,
      "backend" varchar(8) NOT NULL,
      "media_type" varchar(127) NOT NULL,
      "size_bytes" integer NOT NULL,
      "sha256" char(64) NOT NULL,
      "state" varchar(12) NOT NULL,
      "upload_id" uuid,
      "expires_at" timestamptz,
      "purged_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "pk_artifact_contents" PRIMARY KEY ("id"),
      CONSTRAINT "chk_artifact_contents_role" CHECK ("role" IN ('original', 'derivative')),
      CONSTRAINT "chk_artifact_contents_backend" CHECK ("backend" IN ('local', 's3')),
      CONSTRAINT "chk_artifact_contents_size" CHECK ("size_bytes" > 0),
      CONSTRAINT "chk_artifact_contents_sha256" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
      CONSTRAINT "chk_artifact_contents_state" CHECK ("state" IN ('pending', 'ready', 'failed', 'purging', 'purged')),
      CONSTRAINT "fk_artifact_contents_owner" FOREIGN KEY ("tenant_id", "owner_user_id") REFERENCES "api_users"("tenant_id", "id") ON DELETE RESTRICT
    )`);
    // One upload identity is one content: a browser retry finds the first attempt.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_artifact_contents_upload" ON "api_artifact_contents" ("tenant_id", "owner_user_id", "upload_id") WHERE "upload_id" IS NOT NULL`,
    );
    // The quota ledger is a SUM over this index: originals that are stored or reserved.
    await queryRunner.query(
      `CREATE INDEX "idx_artifact_contents_quota" ON "api_artifact_contents" ("tenant_id", "owner_user_id") INCLUDE ("size_bytes", "state", "expires_at") WHERE "role" = 'original' AND "state" IN ('pending', 'ready')`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_artifact_contents_collect" ON "api_artifact_contents" ("updated_at") WHERE "state" IN ('pending', 'failed', 'purging')`,
    );

    await queryRunner.query(`CREATE TABLE "api_artifacts" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "tenant_id" uuid NOT NULL,
      "owner_user_id" uuid NOT NULL,
      "folder_id" uuid,
      "name" varchar(255) NOT NULL,
      "name_key" varchar(255) NOT NULL,
      "kind" varchar(8) NOT NULL,
      "media_type" varchar(127) NOT NULL,
      "size_bytes" integer NOT NULL,
      "sha256" char(64) NOT NULL,
      "current_revision_id" uuid,
      "readiness" varchar(12) NOT NULL,
      "failure_code" varchar(32),
      "page_count" integer,
      "description" varchar(1024),
      "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "deleted_at" timestamptz,
      CONSTRAINT "pk_artifacts" PRIMARY KEY ("id"),
      CONSTRAINT "chk_artifacts_name" CHECK (length(btrim("name")) > 0),
      CONSTRAINT "chk_artifacts_kind" CHECK ("kind" IN ('pdf', 'docx', 'image')),
      CONSTRAINT "chk_artifacts_size" CHECK ("size_bytes" > 0),
      CONSTRAINT "chk_artifacts_readiness" CHECK ("readiness" IN ('processing', 'ready', 'failed')),
      CONSTRAINT "chk_artifacts_tags" CHECK (jsonb_typeof("tags") = 'array' AND jsonb_array_length("tags") <= 16),
      CONSTRAINT "fk_artifacts_owner" FOREIGN KEY ("tenant_id", "owner_user_id") REFERENCES "api_users"("tenant_id", "id") ON DELETE RESTRICT,
      CONSTRAINT "fk_artifacts_folder" FOREIGN KEY ("folder_id") REFERENCES "api_artifact_folders"("id") ON DELETE RESTRICT
    )`);
    // The catalog: the whole library of one owner, newest first.
    await queryRunner.query(
      `CREATE INDEX "idx_artifacts_owner_list" ON "api_artifacts" ("tenant_id", "owner_user_id", "created_at" DESC, "id" DESC) WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_artifacts_sibling" ON "api_artifacts" ("tenant_id", "owner_user_id", "folder_id", "name_key") NULLS NOT DISTINCT WHERE "deleted_at" IS NULL`,
    );
    // The same bytes are one library entry per owner: no second copy, no second quota charge.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_artifacts_owner_sha256" ON "api_artifacts" ("tenant_id", "owner_user_id", "sha256") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      'CREATE INDEX "idx_artifacts_folder" ON "api_artifacts" ("folder_id") WHERE "deleted_at" IS NULL',
    );

    // ALF-DEC-025: an upload creates one immutable revision; attachments pin the exact one.
    await queryRunner.query(`CREATE TABLE "api_artifact_revisions" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "artifact_id" uuid NOT NULL,
      "revision_no" integer NOT NULL,
      "content_id" uuid NOT NULL,
      "origin" varchar(16) NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "pk_artifact_revisions" PRIMARY KEY ("id"),
      CONSTRAINT "uq_artifact_revisions_no" UNIQUE ("artifact_id", "revision_no"),
      CONSTRAINT "chk_artifact_revisions_no" CHECK ("revision_no" > 0),
      CONSTRAINT "chk_artifact_revisions_origin" CHECK ("origin" IN ('upload')),
      CONSTRAINT "fk_artifact_revisions_artifact" FOREIGN KEY ("artifact_id") REFERENCES "api_artifacts"("id") ON DELETE RESTRICT,
      CONSTRAINT "fk_artifact_revisions_content" FOREIGN KEY ("content_id") REFERENCES "api_artifact_contents"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(
      'CREATE INDEX "idx_artifact_revisions_content" ON "api_artifact_revisions" ("content_id")',
    );
    await queryRunner.query(
      `ALTER TABLE "api_artifacts" ADD CONSTRAINT "fk_artifacts_current_revision" FOREIGN KEY ("current_revision_id") REFERENCES "api_artifact_revisions"("id") ON DELETE RESTRICT`,
    );

    // The derived representation and its job: separate so that a list never loads the text.
    await queryRunner.query(`CREATE TABLE "api_artifact_extractions" (
      "content_id" uuid NOT NULL,
      "kind" varchar(8) NOT NULL,
      "state" varchar(12) NOT NULL DEFAULT 'queued',
      "text" text,
      "char_count" integer NOT NULL DEFAULT 0,
      "page_count" integer,
      "truncated" boolean NOT NULL DEFAULT false,
      "derivative_content_id" uuid,
      "failure_code" varchar(32),
      "attempts" smallint NOT NULL DEFAULT 0,
      "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
      "lease_owner" varchar(128),
      "lease_expires_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "pk_artifact_extractions" PRIMARY KEY ("content_id"),
      CONSTRAINT "chk_artifact_extractions_kind" CHECK ("kind" IN ('pdf', 'docx', 'image')),
      CONSTRAINT "chk_artifact_extractions_state" CHECK ("state" IN ('queued', 'running', 'ready', 'failed')),
      CONSTRAINT "chk_artifact_extractions_text" CHECK ("text" IS NULL OR octet_length("text") <= 4194304),
      CONSTRAINT "fk_artifact_extractions_content" FOREIGN KEY ("content_id") REFERENCES "api_artifact_contents"("id") ON DELETE RESTRICT,
      CONSTRAINT "fk_artifact_extractions_derivative" FOREIGN KEY ("derivative_content_id") REFERENCES "api_artifact_contents"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(
      `CREATE INDEX "idx_artifact_extractions_queue" ON "api_artifact_extractions" ("next_attempt_at") WHERE "state" IN ('queued', 'running')`,
    );

    // A message names what it carried even after the file is gone (ALF-DEC-028): the row keeps a
    // snapshot of the name, and its foreign keys refuse a row delete of referenced content.
    await queryRunner.query(`CREATE TABLE "api_message_attachments" (
      "message_id" uuid NOT NULL,
      "artifact_id" uuid NOT NULL,
      "revision_id" uuid NOT NULL,
      "position" smallint NOT NULL,
      "name" varchar(255) NOT NULL,
      "kind" varchar(8) NOT NULL,
      "media_type" varchar(127) NOT NULL,
      "size_bytes" integer NOT NULL,
      "delivery" varchar(12),
      "delivered_chars" integer,
      "truncated" boolean NOT NULL DEFAULT false,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "pk_message_attachments" PRIMARY KEY ("message_id", "artifact_id"),
      CONSTRAINT "chk_message_attachments_position" CHECK ("position" BETWEEN 0 AND 15),
      CONSTRAINT "chk_message_attachments_kind" CHECK ("kind" IN ('pdf', 'docx', 'image')),
      CONSTRAINT "chk_message_attachments_delivery" CHECK ("delivery" IS NULL OR "delivery" IN ('text', 'image', 'unavailable')),
      CONSTRAINT "fk_message_attachments_message" FOREIGN KEY ("message_id") REFERENCES "api_messages"("id") ON DELETE CASCADE,
      CONSTRAINT "fk_message_attachments_artifact" FOREIGN KEY ("artifact_id") REFERENCES "api_artifacts"("id") ON DELETE RESTRICT,
      CONSTRAINT "fk_message_attachments_revision" FOREIGN KEY ("revision_id") REFERENCES "api_artifact_revisions"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(
      'CREATE INDEX "idx_message_attachments_artifact" ON "api_message_attachments" ("artifact_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Refuse to drop the only record of bytes that still exist in the content store.
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM "api_artifact_contents" WHERE "state" <> 'purged') THEN
        RAISE EXCEPTION 'Artifact rollback would orphan stored file content; purge it first';
      END IF;
    END $$`);
    await queryRunner.query('DROP TABLE "api_message_attachments"');
    await queryRunner.query('DROP TABLE "api_artifact_extractions"');
    await queryRunner.query(
      'ALTER TABLE "api_artifacts" DROP CONSTRAINT "fk_artifacts_current_revision"',
    );
    await queryRunner.query('DROP TABLE "api_artifact_revisions"');
    await queryRunner.query('DROP TABLE "api_artifacts"');
    await queryRunner.query('DROP TABLE "api_artifact_contents"');
    await queryRunner.query('DROP TABLE "api_artifact_folders"');
  }
}
