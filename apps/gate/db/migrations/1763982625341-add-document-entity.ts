import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDocumentEntity1763982625341 implements MigrationInterface {
    name = 'AddDocumentEntity1763982625341'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "filename" character varying NOT NULL, "originalName" character varying NOT NULL, "mimetype" character varying NOT NULL, "size" integer NOT NULL, "path" character varying NOT NULL, "thumbnailPath" character varying, "title" character varying, "description" character varying, "content" text, "isProcessed" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "documents" ADD CONSTRAINT "FK_e300b5c2e3fefa9d6f8a3f25975" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT "FK_e300b5c2e3fefa9d6f8a3f25975"`);
        await queryRunner.query(`DROP TABLE "documents"`);
    }

}
