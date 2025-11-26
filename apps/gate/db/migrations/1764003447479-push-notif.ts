import { MigrationInterface, QueryRunner } from "typeorm";

export class PushNotif1764003447479 implements MigrationInterface {
    name = 'PushNotif1764003447479'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "pushToken" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "pushToken"`);
    }

}
