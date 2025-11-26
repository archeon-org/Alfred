import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProfileFields1763948094118 implements MigrationInterface {
    name = 'AddProfileFields1763948094118'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "profilePicture" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "storageUsed" bigint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "storageLimit" bigint NOT NULL DEFAULT '2147483648'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "searchCount" integer NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "searchCount"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "storageLimit"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "storageUsed"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "profilePicture"`);
    }

}
