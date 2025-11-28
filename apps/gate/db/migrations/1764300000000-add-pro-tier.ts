import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProTier1764300000000 implements MigrationInterface {
  name = 'AddProTier1764300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add 'pro' to the subscription_tier_enum
    await queryRunner.query(`
      ALTER TYPE "subscription_tier_enum" ADD VALUE IF NOT EXISTS 'pro'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: PostgreSQL doesn't support removing enum values directly
    // To fully remove, you'd need to recreate the type
    // This is intentionally left as a no-op for safety
    console.log(
      'Down migration for pro tier: enum value removal not supported in PostgreSQL',
    );
  }
}
