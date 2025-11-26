import { MigrationInterface, QueryRunner } from "typeorm";

export class CategoryTemplateTags1764001727028 implements MigrationInterface {
    name = 'CategoryTemplateTags1764001727028'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "icon" character varying NOT NULL DEFAULT 'folder-outline', "color" character varying NOT NULL DEFAULT '#4F46E5', "isSystemDefault" boolean NOT NULL DEFAULT false, "userId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "color" character varying NOT NULL DEFAULT '#94A3B8', "isSystemDefault" boolean NOT NULL DEFAULT false, "userId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "template_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "icon" character varying NOT NULL, "color" character varying NOT NULL, "templateId" uuid, CONSTRAINT "PK_ddd88953a0cd7ee62295a90f984" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "template_tags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "color" character varying NOT NULL, "templateId" uuid, CONSTRAINT "PK_23f3328ba59f875e1beca9d2b0b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying NOT NULL, "icon" character varying NOT NULL, CONSTRAINT "UQ_5624219dd33b4644599d4d4b231" UNIQUE ("name"), CONSTRAINT "PK_515948649ce0bbbe391de702ae5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "document_tags" ("documentId" uuid NOT NULL, "tagId" uuid NOT NULL, CONSTRAINT "PK_5b662ef9a9b76508d84aa6b1e44" PRIMARY KEY ("documentId", "tagId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1f87f7b4ec76661b26ce44dd78" ON "document_tags" ("documentId") `);
        await queryRunner.query(`CREATE INDEX "IDX_abea3d41e67e47e125726fde4b" ON "document_tags" ("tagId") `);
        await queryRunner.query(`ALTER TABLE "documents" ADD "metadata" jsonb`);
        await queryRunner.query(`CREATE TYPE "public"."documents_processingstatus_enum" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')`);
        await queryRunner.query(`ALTER TABLE "documents" ADD "processingStatus" "public"."documents_processingstatus_enum" NOT NULL DEFAULT 'PENDING'`);
        await queryRunner.query(`ALTER TABLE "documents" ADD "deletedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "documents" ADD "categoryId" uuid`);
        await queryRunner.query(`ALTER TABLE "users" ADD "preferences" jsonb NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_13e8b2a21988bec6fdcbb1fa741" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tags" ADD CONSTRAINT "FK_92e67dc508c705dd66c94615576" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "documents" ADD CONSTRAINT "FK_2d7e06f29424dbb29a827a7c1b5" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "template_categories" ADD CONSTRAINT "FK_1b476c1771d0790044cf7e6e887" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "template_tags" ADD CONSTRAINT "FK_23b859ffaf7a6e56c6a374f93f0" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "document_tags" ADD CONSTRAINT "FK_1f87f7b4ec76661b26ce44dd783" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "document_tags" ADD CONSTRAINT "FK_abea3d41e67e47e125726fde4b1" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "document_tags" DROP CONSTRAINT "FK_abea3d41e67e47e125726fde4b1"`);
        await queryRunner.query(`ALTER TABLE "document_tags" DROP CONSTRAINT "FK_1f87f7b4ec76661b26ce44dd783"`);
        await queryRunner.query(`ALTER TABLE "template_tags" DROP CONSTRAINT "FK_23b859ffaf7a6e56c6a374f93f0"`);
        await queryRunner.query(`ALTER TABLE "template_categories" DROP CONSTRAINT "FK_1b476c1771d0790044cf7e6e887"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT "FK_2d7e06f29424dbb29a827a7c1b5"`);
        await queryRunner.query(`ALTER TABLE "tags" DROP CONSTRAINT "FK_92e67dc508c705dd66c94615576"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_13e8b2a21988bec6fdcbb1fa741"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "preferences"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "categoryId"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "processingStatus"`);
        await queryRunner.query(`DROP TYPE "public"."documents_processingstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "metadata"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_abea3d41e67e47e125726fde4b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1f87f7b4ec76661b26ce44dd78"`);
        await queryRunner.query(`DROP TABLE "document_tags"`);
        await queryRunner.query(`DROP TABLE "templates"`);
        await queryRunner.query(`DROP TABLE "template_tags"`);
        await queryRunner.query(`DROP TABLE "template_categories"`);
        await queryRunner.query(`DROP TABLE "tags"`);
        await queryRunner.query(`DROP TABLE "categories"`);
    }

}
