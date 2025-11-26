import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateCreateDates1764022992251 implements MigrationInterface {
  name = 'UpdateCreateDates1764022992251';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categories" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "tags" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "template_categories" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "template_categories" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "template_tags" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "template_tags" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "templates" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "templates" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(`ALTER TABLE "templates" DROP COLUMN "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "templates" DROP COLUMN "createdAt"`);
    await queryRunner.query(
      `ALTER TABLE "template_tags" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "template_tags" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "template_categories" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "template_categories" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(`ALTER TABLE "tags" DROP COLUMN "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "updatedAt"`);
  }
}
