import { MigrationInterface, QueryRunner } from "typeorm";

export class DefaultSystemTagsCategories1764012687172 implements MigrationInterface {
    name = 'DefaultSystemTagsCategories1764012687172'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" ALTER COLUMN "isSystemDefault" SET DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "tags" ALTER COLUMN "isSystemDefault" SET DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tags" ALTER COLUMN "isSystemDefault" SET DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "categories" ALTER COLUMN "isSystemDefault" SET DEFAULT false`);
    }

}
