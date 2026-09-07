import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdempotencyKeys1788739200000 implements MigrationInterface {
  name = 'CreateIdempotencyKeys1788739200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "idempotency_keys" (
        "owner_user_id" uuid NOT NULL,
        "key" varchar(128) NOT NULL,
        "request_hash" char(64) NOT NULL,
        "reservation_id" uuid NOT NULL,
        "response_status" smallint,
        "response_body" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL DEFAULT now() + interval '24 hours',
        CONSTRAINT "pk_idempotency_keys" PRIMARY KEY ("owner_user_id", "key"),
        CONSTRAINT "fk_idempotency_keys_owner" FOREIGN KEY ("owner_user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "chk_idempotency_keys_key" CHECK ("key" ~ '^[A-Za-z0-9_-]{1,128}$'),
        CONSTRAINT "chk_idempotency_keys_hash" CHECK ("request_hash" ~ '^[a-f0-9]{64}$'),
        CONSTRAINT "chk_idempotency_keys_response" CHECK ((("response_status" IS NULL AND "response_body" IS NULL) OR ("response_status" IS NOT NULL AND "response_status" BETWEEN 200 AND 299 AND "response_body" IS NOT NULL)) AND "expires_at" = "created_at" + interval '24 hours')
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_idempotency_keys_expiry" ON "idempotency_keys" ("expires_at")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "idempotency_keys"');
  }
}
