import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEntity, DocumentEmbeddingEntity } from '@archeon-org/database';

export interface SearchResult {
  document: DocumentEntity;
  similarity: number;
  matchReason?: string;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.fireworks.ai/inference/v1';
  private readonly embeddingModel = 'nomic-ai/nomic-embed-text-v1.5';

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(DocumentEntity)
    private readonly documentRepository: Repository<DocumentEntity>,
    @InjectRepository(DocumentEmbeddingEntity)
    private readonly embeddingRepository: Repository<DocumentEmbeddingEntity>,
  ) {
    this.apiKey = this.configService.get<string>('FIREWORKS_API_KEY') || '';
    if (!this.apiKey) {
      this.logger.warn(
        'FIREWORKS_API_KEY is not set. Semantic search will not work.',
      );
    }
  }

  /**
   * Semantic search - find documents by natural language description
   * Examples:
   * - "that electricity bill from January"
   * - "my passport"
   * - "the contract I signed last month"
   * - "documents about my car insurance"
   */
  async semanticSearch(
    userId: string,
    query: string,
    limit: number = 10,
    minSimilarity: number = 0.3,
  ): Promise<SearchResult[]> {
    this.logger.log(
      `Semantic search for user ${userId}: "${query}" (limit: ${limit})`,
    );

    // Check if user has any embeddings
    const embeddingCount = await this.embeddingRepository.count({
      where: { userId },
    });

    if (embeddingCount === 0) {
      this.logger.warn(`No embeddings found for user ${userId}`);
      return [];
    }

    // Generate embedding for the search query
    const queryEmbedding = await this.generateEmbedding(query);
    const embeddingString = `[${queryEmbedding.join(',')}]`;

    // Find similar documents using pgvector cosine similarity
    // We join with documents to get full document info in one query
    const results = await this.embeddingRepository.query(
      `
      SELECT 
        d.*,
        1 - (e."embedding" <=> $1::vector) as similarity
      FROM "document_embeddings" e
      INNER JOIN "documents" d ON d."id" = e."documentId"
      WHERE e."userId" = $2
        AND d."deletedAt" IS NULL
        AND 1 - (e."embedding" <=> $1::vector) >= $3
      ORDER BY e."embedding" <=> $1::vector
      LIMIT $4
      `,
      [embeddingString, userId, minSimilarity, limit],
    );

    this.logger.log(
      `Found ${results.length} documents matching query "${query}"`,
    );

    return results.map((row: any) => ({
      document: {
        id: row.id,
        filename: row.filename,
        originalName: row.originalName,
        mimetype: row.mimetype,
        size: row.size,
        path: row.path,
        thumbnailPath: row.thumbnailPath,
        title: row.title,
        description: row.description,
        isProcessed: row.isProcessed,
        processingStatus: row.processingStatus,
        classificationSource: row.classificationSource,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        userId: row.userId,
        categoryId: row.categoryId,
      } as DocumentEntity,
      similarity: parseFloat(row.similarity),
    }));
  }

  /**
   * Hybrid search - combines semantic search with keyword matching
   * Better for specific terms like invoice numbers, dates, names
   */
  async hybridSearch(
    userId: string,
    query: string,
    limit: number = 10,
  ): Promise<SearchResult[]> {
    this.logger.log(`Hybrid search for user ${userId}: "${query}"`);

    // Run semantic search and keyword search in parallel
    const [semanticResults, keywordResults] = await Promise.all([
      this.semanticSearch(userId, query, limit, 0.25),
      this.keywordSearch(userId, query, limit),
    ]);

    // Merge results, preferring semantic matches but boosting keyword matches
    const resultMap = new Map<string, SearchResult>();

    // Add semantic results first
    for (const result of semanticResults) {
      resultMap.set(result.document.id, result);
    }

    // Add keyword results, boosting similarity if they also appeared in semantic
    for (const result of keywordResults) {
      const existing = resultMap.get(result.document.id);
      if (existing) {
        // Boost similarity for documents that match both
        existing.similarity = Math.min(1, existing.similarity + 0.2);
        existing.matchReason = 'semantic + keyword';
      } else {
        result.matchReason = 'keyword';
        resultMap.set(result.document.id, result);
      }
    }

    // Sort by similarity and return
    return Array.from(resultMap.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Keyword search - traditional text search on title and content
   */
  private async keywordSearch(
    userId: string,
    query: string,
    limit: number,
  ): Promise<SearchResult[]> {
    // Clean and prepare search terms
    const searchTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 2);

    if (searchTerms.length === 0) {
      return [];
    }

    // Build ILIKE conditions for each term
    const conditions = searchTerms
      .map(
        (_, i) =>
          `(LOWER(d."title") LIKE $${i + 2} OR LOWER(d."originalName") LIKE $${i + 2})`,
      )
      .join(' OR ');

    const params = [userId, ...searchTerms.map((term) => `%${term}%`), limit];

    const results = await this.documentRepository.query(
      `
      SELECT d.*
      FROM "documents" d
      WHERE d."userId" = $1
        AND d."deletedAt" IS NULL
        AND (${conditions})
      ORDER BY d."createdAt" DESC
      LIMIT $${searchTerms.length + 2}
      `,
      params,
    );

    return results.map((row: any) => ({
      document: row as DocumentEntity,
      similarity: 0.5, // Base similarity for keyword matches
    }));
  }

  /**
   * Generate embedding for search query
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: text,
        model: this.embeddingModel,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Fireworks API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }
}
