import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserUpdate1763824040050 implements MigrationInterface {
  name = 'UserUpdate1763824040050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password"`);
    await queryRunner.query(
      `CREATE TYPE "public"."users_provider_enum" AS ENUM('google', 'apple')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "provider" "public"."users_provider_enum" NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "lastLoginAt" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastLoginAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "provider"`);
    await queryRunner.query(`DROP TYPE "public"."users_provider_enum"`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "password" character varying NOT NULL`,
    );
  }
}
