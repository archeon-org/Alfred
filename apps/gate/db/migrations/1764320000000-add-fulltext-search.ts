import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to add Full-Text Search (FTS) capabilities for scalable keyword search
 *
 * This creates:
 * 1. A generated tsvector column combining searchable fields
 * 2. A GIN index for fast full-text search
 * 3. A trigger to automatically update the search vector on changes
 *
 * Benefits:
 * - O(log n) search instead of O(n) table scan
 * - Supports stemming, ranking, and phrase search
 * - Handles millions of documents efficiently
 */
export class AddFulltextSearch1764320000000 implements MigrationInterface {
  name = 'AddFulltextSearch1764320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add the tsvector column for full-text search
    // This stores pre-computed search tokens for fast lookup
    await queryRunner.query(`
      ALTER TABLE "documents" 
      ADD COLUMN IF NOT EXISTS "search_vector" tsvector
    `);

    // Create a function to generate the search vector from document fields
    // Weights: A (title) > B (description) > C (content/metadata)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION documents_search_vector_update() RETURNS trigger AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW."originalName", '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'C') ||
          setweight(to_tsvector('english', COALESCE(NEW.metadata::text, '')), 'C');
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql
    `);

    // Create trigger to auto-update search_vector on INSERT or UPDATE
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS documents_search_vector_trigger ON "documents"
    `);

    await queryRunner.query(`
      CREATE TRIGGER documents_search_vector_trigger
      BEFORE INSERT OR UPDATE OF title, "originalName", description, content, metadata
      ON "documents"
      FOR EACH ROW
      EXECUTE FUNCTION documents_search_vector_update()
    `);

    // Create GIN index for fast full-text search
    // GIN (Generalized Inverted Index) is optimized for text search
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_documents_search_vector" 
      ON "documents" USING GIN ("search_vector")
    `);

    // Populate search_vector for existing documents
    await queryRunner.query(`
      UPDATE "documents" SET
        "search_vector" = 
          setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE("originalName", '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(content, '')), 'C') ||
          setweight(to_tsvector('english', COALESCE(metadata::text, '')), 'C')
      WHERE "search_vector" IS NULL
    `);

    // Create index on userId + search_vector for user-scoped searches
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_documents_user_search" 
      ON "documents" ("userId") 
      WHERE "deletedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_documents_user_search"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_documents_search_vector"`,
    );

    // Remove trigger
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS documents_search_vector_trigger ON "documents"`,
    );

    // Remove function
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS documents_search_vector_update()`,
    );

    // Remove column
    await queryRunner.query(
      `ALTER TABLE "documents" DROP COLUMN IF EXISTS "search_vector"`,
    );
  }
}
