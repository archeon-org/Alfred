import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderSeeding1764023930354 implements MigrationInterface {
    name = 'OrderSeeding1764023930354'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" ADD "order" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "tags" ADD "order" integer NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tags" DROP COLUMN "order"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "order"`);
    }

}
