import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdentityFoundation1788464265141 implements MigrationInterface {
  name = 'CreateIdentityFoundation1788464265141';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" citext NOT NULL,
        "display_name" varchar(160) NOT NULL,
        "avatar_url" varchar(2048),
        "role" varchar(16) NOT NULL DEFAULT 'user',
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "last_login_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "chk_users_role" CHECK ("role" IN ('user', 'admin')),
        CONSTRAINT "chk_users_status" CHECK ("status" IN ('active', 'disabled'))
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email")');
    await queryRunner.query(`
      CREATE TABLE "user_identities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "provider" varchar(32) NOT NULL,
        "issuer" varchar(512) NOT NULL,
        "subject" varchar(255) NOT NULL,
        "email_at_link" citext NOT NULL,
        "last_authenticated_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_user_identities" PRIMARY KEY ("id"),
        CONSTRAINT "fk_user_identities_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "uq_user_identities_issuer_subject" ON "user_identities" ("issuer", "subject")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_user_identities_user" ON "user_identities" ("user_id")',
    );
    await queryRunner.query(`
      CREATE TABLE "oauth_login_states" (
        "state_hash" char(64) NOT NULL,
        "code_verifier" varchar(128) NOT NULL,
        "nonce" varchar(128) NOT NULL,
        "return_to" varchar(2048) NOT NULL DEFAULT '/app',
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_oauth_login_states" PRIMARY KEY ("state_hash")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_oauth_login_states_expiry" ON "oauth_login_states" ("expires_at")',
    );
    await queryRunner.query(`
      CREATE TABLE "refresh_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "family_id" uuid NOT NULL,
        "token_hash" char(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "rotated_at" timestamptz,
        "revoked_at" timestamptz,
        "replaced_by_session_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_refresh_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_refresh_sessions_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_refresh_sessions_replacement" FOREIGN KEY ("replaced_by_session_id")
          REFERENCES "refresh_sessions"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "uq_refresh_sessions_token_hash" ON "refresh_sessions" ("token_hash")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_refresh_sessions_family" ON "refresh_sessions" ("family_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_refresh_sessions_user" ON "refresh_sessions" ("user_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_refresh_sessions_expiry" ON "refresh_sessions" ("expires_at")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "refresh_sessions"');
    await queryRunner.query('DROP TABLE IF EXISTS "oauth_login_states"');
    await queryRunner.query('DROP TABLE IF EXISTS "user_identities"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
  }
}
