import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExtraStorageField1764282708777 implements MigrationInterface {
  name = 'AddExtraStorageField1764282708777';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add extraStorage field to track purchased storage
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "extraStorage" bigint NOT NULL DEFAULT 0
    `);

    // Update storageLimit default to 1GB (1073741824 bytes) for free tier
    // Note: This doesn't change existing users, just the default for new ones
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "storageLimit" SET DEFAULT 1073741824
    `);

    // Update existing users to have 1GB base storage + their extra storage
    // If they had more than 1GB, we keep that as "extra storage" they've earned
    await queryRunner.query(`
      UPDATE "users"
      SET 
        "extraStorage" = GREATEST(0, "storageLimit" - 1073741824),
        "storageLimit" = 1073741824 + GREATEST(0, "storageLimit" - 1073741824)
      WHERE "storageLimit" > 1073741824
    `);

    // For users with less than 1GB, just set to 1GB
    await queryRunner.query(`
      UPDATE "users"
      SET "storageLimit" = 1073741824
      WHERE "storageLimit" < 1073741824
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore original storage limit (base + extra)
    await queryRunner.query(`
      UPDATE "users"
      SET "storageLimit" = "storageLimit" + "extraStorage"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "extraStorage"
    `);

    // Restore default to 2GB
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "storageLimit" SET DEFAULT 2147483648
    `);
  }
}
