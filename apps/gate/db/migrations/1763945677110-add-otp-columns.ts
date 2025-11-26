import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOtpColumns1763945677110 implements MigrationInterface {
  name = 'AddOtpColumns1763945677110';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "otpHash" character varying`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "otpExpiresAt" TIMESTAMP`);
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum" RENAME TO "users_role_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'user', 'guest')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING lower("role"::"text")::"public"."users_role_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user'`,
    );
    await queryRunner.query(`DROP TYPE "public"."users_role_enum_old"`);
    await queryRunner.query(
      `ALTER TYPE "public"."users_provider_enum" RENAME TO "users_provider_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_provider_enum" AS ENUM('local', 'google', 'facebook', 'github', 'apple')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "provider" TYPE "public"."users_provider_enum" USING lower("provider"::"text")::"public"."users_provider_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."users_provider_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_provider_enum_old" AS ENUM('google', 'apple')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "provider" TYPE "public"."users_provider_enum_old" USING "provider"::"text"::"public"."users_provider_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."users_provider_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."users_provider_enum_old" RENAME TO "users_provider_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum_old" AS ENUM('USER', 'ADMIN')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum_old" USING "role"::"text"::"public"."users_role_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER'`,
    );
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum_old" RENAME TO "users_role_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "otpExpiresAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "otpHash"`);
  }
}
