import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to drop the document_embeddings table.
 *
 * REASON: Document embeddings in PostgreSQL/pgvector are no longer used.
 * Search now uses Graphiti knowledge graph with embeddings stored in Neo4j.
 *
 * The old approach stored full-document embeddings in pgvector for similarity search.
 * The new Graphiti approach extracts entities and relationships, storing their
 * embeddings in Neo4j for hybrid search (BM25 + vector + graph traversal).
 */
export class DropDocumentEmbeddings1765400000000 implements MigrationInterface {
  name = 'DropDocumentEmbeddings1765400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints first
    await queryRunner.query(
      `ALTER TABLE "document_embeddings" DROP CONSTRAINT IF EXISTS "FK_document_embeddings_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_embeddings" DROP CONSTRAINT IF EXISTS "FK_document_embeddings_document"`,
    );

    // Drop indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_document_embeddings_vector"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_document_embeddings_document"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_document_embeddings_user"`,
    );

    // Drop the table
    await queryRunner.query(`DROP TABLE IF EXISTS "document_embeddings"`);

    // Note: We keep the pgvector extension as it might be used by other features
    // await queryRunner.query(`DROP EXTENSION IF EXISTS vector`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate the table (restore from AddDocumentEmbeddings1764100000000)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

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

    await queryRunner.query(
      `CREATE INDEX "idx_document_embeddings_user" ON "document_embeddings" ("userId")`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_document_embeddings_document" ON "document_embeddings" ("documentId")`,
    );

    await queryRunner.query(`
      CREATE INDEX "idx_document_embeddings_vector" ON "document_embeddings" 
      USING hnsw ("embedding" vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);

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
}
