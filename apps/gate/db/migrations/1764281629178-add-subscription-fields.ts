import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionFields1764281629178 implements MigrationInterface {
  name = 'AddSubscriptionFields1764281629178';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create subscription tier enum
    await queryRunner.query(`
      CREATE TYPE "subscription_tier_enum" AS ENUM ('free')
    `);

    // Add subscription fields to users table
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "subscriptionTier" "subscription_tier_enum" NOT NULL DEFAULT 'free'
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "credits" integer NOT NULL DEFAULT 15
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "dailySearchUsed" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "dailySearchResetAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    `);

    // Set initial credits for existing users (give them the signup bonus)
    await queryRunner.query(`
      UPDATE "users" SET "credits" = 15 WHERE "credits" = 15
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "dailySearchResetAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "dailySearchUsed"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "credits"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "subscriptionTier"
    `);

    await queryRunner.query(`
      DROP TYPE "subscription_tier_enum"
    `);
  }
}
