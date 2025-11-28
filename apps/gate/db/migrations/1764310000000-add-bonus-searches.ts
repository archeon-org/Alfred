import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBonusSearches1764310000000 implements MigrationInterface {
  name = 'AddBonusSearches1764310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add bonusSearches column with default 0
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "bonusSearches" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "bonusSearches"
    `);
  }
}
