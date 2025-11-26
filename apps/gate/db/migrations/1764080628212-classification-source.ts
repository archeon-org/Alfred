import { MigrationInterface, QueryRunner } from "typeorm";

export class ClassificationSource1764080628212 implements MigrationInterface {
    name = 'ClassificationSource1764080628212'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."documents_classificationsource_enum" AS ENUM('AI', 'MANUAL')`);
        await queryRunner.query(`ALTER TABLE "documents" ADD "classificationSource" "public"."documents_classificationsource_enum" NOT NULL DEFAULT 'AI'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "classificationSource"`);
        await queryRunner.query(`DROP TYPE "public"."documents_classificationsource_enum"`);
    }

}
