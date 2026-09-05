import type { MigrationInterface, QueryRunner } from 'typeorm';

export class GeneralizeOauthLoginState1788527000000 implements MigrationInterface {
  name = 'GeneralizeOauthLoginState1788527000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "oauth_login_states" ADD "provider_key" varchar(64)');
    await queryRunner.query('ALTER TABLE "oauth_login_states" ADD "provider_context" jsonb');
    await queryRunner.query(`
      UPDATE "oauth_login_states"
      SET "provider_key" = 'google',
          "provider_context" = jsonb_build_object(
            'codeVerifier', "code_verifier",
            'nonce', "nonce"
          )
    `);
    await queryRunner.query(
      'ALTER TABLE "oauth_login_states" ALTER COLUMN "provider_key" SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "oauth_login_states" ALTER COLUMN "provider_context" SET NOT NULL',
    );
    await queryRunner.query('ALTER TABLE "oauth_login_states" DROP COLUMN "code_verifier"');
    await queryRunner.query('ALTER TABLE "oauth_login_states" DROP COLUMN "nonce"');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "oauth_login_states"
      WHERE "provider_context" ->> 'codeVerifier' IS NULL
         OR "provider_context" ->> 'nonce' IS NULL
    `);
    await queryRunner.query('ALTER TABLE "oauth_login_states" ADD "code_verifier" varchar(128)');
    await queryRunner.query('ALTER TABLE "oauth_login_states" ADD "nonce" varchar(128)');
    await queryRunner.query(`
      UPDATE "oauth_login_states"
      SET "code_verifier" = "provider_context" ->> 'codeVerifier',
          "nonce" = "provider_context" ->> 'nonce'
    `);
    await queryRunner.query(
      'ALTER TABLE "oauth_login_states" ALTER COLUMN "code_verifier" SET NOT NULL',
    );
    await queryRunner.query('ALTER TABLE "oauth_login_states" ALTER COLUMN "nonce" SET NOT NULL');
    await queryRunner.query('ALTER TABLE "oauth_login_states" DROP COLUMN "provider_context"');
    await queryRunner.query('ALTER TABLE "oauth_login_states" DROP COLUMN "provider_key"');
  }
}
