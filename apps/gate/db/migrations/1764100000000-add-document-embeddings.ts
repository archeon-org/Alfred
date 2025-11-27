import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentEmbeddings1764100000000 implements MigrationInterface {
  name = 'AddDocumentEmbeddings1764100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pgvector extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    // Create the document_embeddings table
    await queryRunner.query(`
      CREATE TABLE "document_embeddings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "documentId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "embedding" vector(768) NOT NULL,
        "model" character varying NOT NULL DEFAULT 'nomic-ai/nomic-embed-text-v1.5',
        "dimensions" integer NOT NULL DEFAULT 768,
        "contentHash" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_document_embeddings" PRIMARY KEY ("id")
      )
    `);

    // Create indexes for efficient querying
    await queryRunner.query(
      `CREATE INDEX "idx_document_embeddings_user" ON "document_embeddings" ("userId")`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_document_embeddings_document" ON "document_embeddings" ("documentId")`,
    );

    // Create HNSW index for fast vector similarity search
    // This is crucial for efficient semantic search
    await queryRunner.query(`
      CREATE INDEX "idx_document_embeddings_vector" ON "document_embeddings" 
      USING hnsw ("embedding" vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "document_embeddings" 
      ADD CONSTRAINT "FK_document_embeddings_document" 
      FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "document_embeddings" 
      ADD CONSTRAINT "FK_document_embeddings_user" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document_embeddings" DROP CONSTRAINT "FK_document_embeddings_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_embeddings" DROP CONSTRAINT "FK_document_embeddings_document"`,
    );
    await queryRunner.query(`DROP INDEX "idx_document_embeddings_vector"`);
    await queryRunner.query(`DROP INDEX "idx_document_embeddings_document"`);
    await queryRunner.query(`DROP INDEX "idx_document_embeddings_user"`);
    await queryRunner.query(`DROP TABLE "document_embeddings"`);
  }
}
