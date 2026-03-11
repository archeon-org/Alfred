import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentChunks1766500000000 implements MigrationInterface {
  name = 'AddDocumentChunks1766500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await queryRunner.query(`
      CREATE TABLE "document_chunks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "documentId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "chunkIndex" integer NOT NULL,
        "content" text NOT NULL,
        "contentHash" character varying NOT NULL,
        "tokenCount" integer NOT NULL,
        "startOffset" integer NOT NULL,
        "endOffset" integer NOT NULL,
        "embedding" vector(1536) NOT NULL,
        "model" character varying NOT NULL DEFAULT 'fireworks/qwen3-embedding-8b',
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_document_chunks" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "document_chunks"
      ADD CONSTRAINT "UQ_document_chunks_document_chunk"
      UNIQUE ("documentId", "chunkIndex")
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_document_chunks_user" ON "document_chunks" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_document_chunks_document" ON "document_chunks" ("documentId")`,
    );
    await queryRunner.query(`
      CREATE INDEX "idx_document_chunks_embedding" ON "document_chunks"
      USING hnsw ("embedding" vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_document_chunks_fts" ON "document_chunks"
      USING GIN (to_tsvector('simple', "content"))
    `);

    await queryRunner.query(`
      ALTER TABLE "document_chunks"
      ADD CONSTRAINT "FK_document_chunks_document"
      FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "document_chunks"
      ADD CONSTRAINT "FK_document_chunks_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document_chunks" DROP CONSTRAINT IF EXISTS "FK_document_chunks_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_chunks" DROP CONSTRAINT IF EXISTS "FK_document_chunks_document"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_document_chunks_fts"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_document_chunks_embedding"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_document_chunks_document"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_document_chunks_user"`);
    await queryRunner.query(
      `ALTER TABLE "document_chunks" DROP CONSTRAINT IF EXISTS "UQ_document_chunks_document_chunk"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "document_chunks"`);
  }
}
