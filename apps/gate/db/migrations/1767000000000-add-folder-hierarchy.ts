import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFolderHierarchy1767000000000 implements MigrationInterface {
  name = 'AddFolderHierarchy1767000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categories" ADD "parentId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "template_categories" ADD "parentTemplateCategoryId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "template_categories" ADD "level" integer NOT NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "FK_categories_parent" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "template_categories" ADD CONSTRAINT "FK_template_categories_parent" FOREIGN KEY ("parentTemplateCategoryId") REFERENCES "template_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "template_categories" DROP CONSTRAINT "FK_template_categories_parent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "FK_categories_parent"`,
    );
    await queryRunner.query(`ALTER TABLE "template_categories" DROP COLUMN "level"`);
    await queryRunner.query(
      `ALTER TABLE "template_categories" DROP COLUMN "parentTemplateCategoryId"`,
    );
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "parentId"`);
  }
}
