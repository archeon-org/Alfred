import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEmbeddingEntity } from '@archeon-org/database';
import * as crypto from 'crypto';

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.fireworks.ai/inference/v1';
  private readonly model = 'nomic-ai/nomic-embed-text-v1.5';
  private readonly dimensions = 768;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(DocumentEmbeddingEntity)
    private readonly embeddingRepository: Repository<DocumentEmbeddingEntity>,
  ) {
    this.apiKey = this.configService.get<string>('FIREWORKS_API_KEY') || '';
    if (!this.apiKey) {
      this.logger.warn(
        'FIREWORKS_API_KEY is not set. Embedding generation will fail.',
      );
    }
  }

  /**
   * Generate embedding for text content using Fireworks AI
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    this.logger.log('Generating embedding for text...');

    // Truncate text to avoid token limits (nomic-embed supports up to 8192 tokens)
    // Approximate 4 chars per token, so ~32000 chars max
    const truncatedText = text.length > 30000 ? text.substring(0, 30000) : text;

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: truncatedText,
          model: this.model,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Fireworks API error: ${response.status} - ${errorText}`,
        );
      }

      const data = await response.json();

      if (!data.data || !data.data[0] || !data.data[0].embedding) {
        throw new Error('Invalid response from Fireworks API');
      }

      const embedding = data.data[0].embedding;

      this.logger.log(
        `Generated embedding with ${embedding.length} dimensions`,
      );

      return {
        embedding,
        model: this.model,
        dimensions: embedding.length,
      };
    } catch (error) {
      this.logger.error(
        'Failed to generate embedding',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Create or update embedding for a document
   */
  async createOrUpdateEmbedding(
    documentId: string,
    userId: string,
    content: string,
  ): Promise<DocumentEmbeddingEntity> {
    this.logger.log(`Creating/updating embedding for document: ${documentId}`);

    // Generate content hash to detect changes
    const contentHash = this.hashContent(content);

    // Check if embedding already exists
    const existingEmbedding = await this.embeddingRepository.findOne({
      where: { documentId },
    });

    // If embedding exists and content hasn't changed, skip regeneration
    if (existingEmbedding && existingEmbedding.contentHash === contentHash) {
      this.logger.log(
        `Embedding already exists and content unchanged for document: ${documentId}`,
      );
      return existingEmbedding;
    }

    // Generate new embedding
    const { embedding, model, dimensions } =
      await this.generateEmbedding(content);

    // Format embedding as pgvector string: [0.1, 0.2, ...]
    const embeddingString = `[${embedding.join(',')}]`;

    if (existingEmbedding) {
      // Update existing embedding using raw query for pgvector compatibility
      await this.embeddingRepository.query(
        `
        UPDATE "document_embeddings"
        SET "embedding" = $1::vector,
            "model" = $2,
            "dimensions" = $3,
            "contentHash" = $4
        WHERE "id" = $5
        `,
        [embeddingString, model, dimensions, contentHash, existingEmbedding.id],
      );
      this.logger.log(`Updated embedding for document: ${documentId}`);

      // Return updated entity
      return this.embeddingRepository.findOne({
        where: { documentId },
      }) as Promise<DocumentEmbeddingEntity>;
    }

    // Create new embedding using raw query for pgvector compatibility
    const result = await this.embeddingRepository.query(
      `
      INSERT INTO "document_embeddings" ("documentId", "userId", "embedding", "model", "dimensions", "contentHash")
      VALUES ($1, $2, $3::vector, $4, $5, $6)
      RETURNING "id"
      `,
      [documentId, userId, embeddingString, model, dimensions, contentHash],
    );

    this.logger.log(`Created new embedding for document: ${documentId}`);

    // Return the created entity
    return this.embeddingRepository.findOne({
      where: { id: result[0].id },
    }) as Promise<DocumentEmbeddingEntity>;
  }

  /**
   * Delete embedding for a document
   */
  async deleteEmbedding(documentId: string): Promise<void> {
    this.logger.log(`Deleting embedding for document: ${documentId}`);
    await this.embeddingRepository.delete({ documentId });
  }

  /**
   * Delete all embeddings for a user
   */
  async deleteUserEmbeddings(userId: string): Promise<void> {
    this.logger.log(`Deleting all embeddings for user: ${userId}`);
    await this.embeddingRepository.delete({ userId });
  }

  /**
   * Find similar documents for a user using vector similarity search
   * Returns documents ordered by similarity (most similar first)
   */
  async findSimilarDocuments(
    userId: string,
    queryText: string,
    limit: number = 10,
  ): Promise<{ documentId: string; similarity: number }[]> {
    this.logger.log(`Finding similar documents for user: ${userId}`);

    // Generate embedding for the query
    const { embedding } = await this.generateEmbedding(queryText);

    // Use raw query for vector similarity search with pgvector
    // Using cosine similarity (1 - cosine distance)
    const results = await this.embeddingRepository.query(
      `
      SELECT 
        "documentId",
        1 - ("embedding" <=> $1::vector) as similarity
      FROM "document_embeddings"
      WHERE "userId" = $2
      ORDER BY "embedding" <=> $1::vector
      LIMIT $3
      `,
      [`[${embedding.join(',')}]`, userId, limit],
    );

    this.logger.log(`Found ${results.length} similar documents`);

    return results.map((r: any) => ({
      documentId: r.documentId,
      similarity: parseFloat(r.similarity),
    }));
  }

  /**
   * Generate a hash of content for change detection
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
