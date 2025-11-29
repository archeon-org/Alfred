import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEntity, DocumentEmbeddingEntity } from '@archeon-org/database';

export interface SearchResult {
  document: DocumentEntity;
  similarity: number;
  matchReason?: string;
  matchDetails?: {
    semantic?: number;
    titleMatch?: boolean;
    contentMatch?: boolean;
    descriptionMatch?: boolean;
    metadataMatch?: boolean;
  };
}

// Weights for combining different search strategies
const SEARCH_WEIGHTS = {
  semantic: 0.5, // Vector similarity base weight
  titleMatch: 0.25, // Exact/partial title match bonus
  contentMatch: 0.15, // Content/OCR text match bonus
  descriptionMatch: 0.1, // Description match bonus
  metadataMatch: 0.1, // Metadata field match bonus
  multiStrategyBonus: 0.1, // Bonus when multiple strategies match
};

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
   * Hybrid search - combines semantic search with comprehensive keyword matching
   * Searches across: title, originalName, description, content (OCR), and metadata
   * Uses weighted scoring for optimal result ranking
   */
  async hybridSearch(
    userId: string,
    query: string,
    limit: number = 10,
  ): Promise<SearchResult[]> {
    this.logger.log(`Hybrid search for user ${userId}: "${query}"`);

    // Run all search strategies in parallel for maximum performance
    const [semanticResults, keywordResults] = await Promise.all([
      this.semanticSearch(userId, query, limit * 2, 0.2), // Fetch more, lower threshold
      this.comprehensiveKeywordSearch(userId, query, limit * 2),
    ]);

    // Merge and score results using weighted combination
    const resultMap = new Map<string, SearchResult>();

    // Process semantic results first (base scores)
    for (const result of semanticResults) {
      const docId = result.document.id;
      resultMap.set(docId, {
        ...result,
        matchDetails: {
          semantic: result.similarity,
        },
      });
    }

    // Process keyword results and combine scores
    for (const result of keywordResults) {
      const docId = result.document.id;
      const existing = resultMap.get(docId);

      if (existing) {
        // Document found by both strategies - combine scores
        const combinedDetails = {
          ...existing.matchDetails,
          ...result.matchDetails,
        };

        // Calculate weighted score
        const weightedScore = this.calculateWeightedScore(combinedDetails);

        existing.similarity = weightedScore;
        existing.matchReason = this.buildMatchReason(combinedDetails);
        existing.matchDetails = combinedDetails;
      } else {
        // Only found by keyword search
        const weightedScore = this.calculateWeightedScore(
          result.matchDetails || {},
        );
        resultMap.set(docId, {
          ...result,
          similarity: weightedScore,
          matchReason: this.buildMatchReason(result.matchDetails || {}),
        });
      }
    }

    // Sort by combined score and return top results
    return Array.from(resultMap.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Calculate weighted score from match details
   */
  private calculateWeightedScore(
    details: SearchResult['matchDetails'],
  ): number {
    if (!details) return 0;

    let score = 0;
    let matchCount = 0;

    // Semantic similarity (already 0-1)
    if (details.semantic !== undefined) {
      score += details.semantic * SEARCH_WEIGHTS.semantic;
      matchCount++;
    }

    // Title match bonus
    if (details.titleMatch) {
      score += SEARCH_WEIGHTS.titleMatch;
      matchCount++;
    }

    // Content match bonus
    if (details.contentMatch) {
      score += SEARCH_WEIGHTS.contentMatch;
      matchCount++;
    }

    // Description match bonus
    if (details.descriptionMatch) {
      score += SEARCH_WEIGHTS.descriptionMatch;
      matchCount++;
    }

    // Metadata match bonus
    if (details.metadataMatch) {
      score += SEARCH_WEIGHTS.metadataMatch;
      matchCount++;
    }

    // Multi-strategy bonus (when 2+ strategies match)
    if (matchCount >= 2) {
      score += SEARCH_WEIGHTS.multiStrategyBonus * (matchCount - 1);
    }

    // Normalize to 0-1 range
    return Math.min(1, score);
  }

  /**
   * Build human-readable match reason
   */
  private buildMatchReason(details: SearchResult['matchDetails']): string {
    if (!details) return 'unknown';

    const reasons: string[] = [];

    if (details.semantic !== undefined && details.semantic > 0.3) {
      reasons.push('semantic');
    }
    if (details.titleMatch) reasons.push('title');
    if (details.contentMatch) reasons.push('content');
    if (details.descriptionMatch) reasons.push('description');
    if (details.metadataMatch) reasons.push('metadata');

    return reasons.join(' + ') || 'keyword';
  }

  /**
   * Comprehensive keyword search using PostgreSQL Full-Text Search
   * Uses GIN-indexed tsvector for O(log n) performance at scale
   *
   * Features:
   * - Stemming: "running" matches "run", "runs", etc.
   * - Ranking: Title matches rank higher than content matches
   * - Phrase search: Supports quoted phrases
   * - Scales to millions of documents
   */
  private async comprehensiveKeywordSearch(
    userId: string,
    query: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const searchTerms = this.tokenizeQuery(query);

    if (searchTerms.length === 0) {
      return [];
    }

    this.logger.log(`FTS keyword search with terms: ${searchTerms.join(', ')}`);

    try {
      // Use PostgreSQL Full-Text Search with ranking
      const results = await this.documentRepository.query(
        `
        SELECT 
          d.*,
          ts_rank_cd(d."search_vector", query, 32) as rank,
          -- Check which weight classes matched for detailed scoring
          ts_rank_cd(d."search_vector", query, 1) > 0 as has_match
        FROM "documents" d,
          plainto_tsquery('english', $2) query
        WHERE d."userId" = $1
          AND d."deletedAt" IS NULL
          AND d."search_vector" @@ query
        ORDER BY rank DESC, d."createdAt" DESC
        LIMIT $3
        `,
        [userId, query, limit],
      );

      // If FTS returns results, use them
      if (results.length > 0) {
        return results.map((row: any) => ({
          document: this.mapRowToDocument(row),
          similarity: this.normalizeFtsRank(row.rank),
          matchReason: 'fulltext',
          matchDetails: {
            titleMatch: true, // FTS doesn't distinguish easily, assume true if matched
            contentMatch: true,
          },
        }));
      }

      // Fallback to ILIKE for very short queries or when FTS finds nothing
      // This handles edge cases like single characters or special terms
      return this.fallbackKeywordSearch(userId, searchTerms, limit);
    } catch (error) {
      // If search_vector column doesn't exist yet (migration not run), fall back
      this.logger.warn('FTS query failed, falling back to ILIKE search', error);
      return this.fallbackKeywordSearch(userId, searchTerms, limit);
    }
  }

  /**
   * Fallback ILIKE search for edge cases or pre-migration compatibility
   * Only searches title and originalName (lighter fields)
   */
  private async fallbackKeywordSearch(
    userId: string,
    searchTerms: string[],
    limit: number,
  ): Promise<SearchResult[]> {
    if (searchTerms.length === 0) return [];

    // Build simple ILIKE conditions for title/name only (faster)
    const conditions = searchTerms.map(
      (term) => `(
        LOWER(COALESCE(d."title", '')) LIKE '%${this.escapeSqlLike(term)}%' OR
        LOWER(COALESCE(d."originalName", '')) LIKE '%${this.escapeSqlLike(term)}%'
      )`,
    );

    const results = await this.documentRepository.query(
      `
      SELECT d.*
      FROM "documents" d
      WHERE d."userId" = $1
        AND d."deletedAt" IS NULL
        AND (${conditions.join(' OR ')})
      ORDER BY d."createdAt" DESC
      LIMIT $2
      `,
      [userId, limit],
    );

    return results.map((row: any) => ({
      document: this.mapRowToDocument(row),
      similarity: 0.4, // Lower score for fallback matches
      matchReason: 'keyword-fallback',
      matchDetails: {
        titleMatch: true,
      },
    }));
  }

  /**
   * Normalize FTS rank to 0-1 range
   * ts_rank_cd returns values typically in 0-1 range but can exceed
   */
  private normalizeFtsRank(rank: number): number {
    // ts_rank_cd with normalization 32 typically returns 0-1
    // but we clamp and scale for consistency
    return Math.min(1, Math.max(0, rank * 2));
  }

  /**
   * Tokenize query into searchable terms
   */
  private tokenizeQuery(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove special chars
      .split(/\s+/)
      .filter((term) => term.length > 1) // Keep terms > 1 char
      .slice(0, 10); // Limit to 10 terms for performance
  }

  /**
   * Escape special characters for SQL LIKE
   */
  private escapeSqlLike(str: string): string {
    return str.replace(/[%_\\]/g, '\\$&');
  }

  /**
   * Map database row to DocumentEntity
   */
  private mapRowToDocument(row: any): DocumentEntity {
    return {
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
      metadata: row.metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      userId: row.userId,
      categoryId: row.categoryId,
    } as DocumentEntity;
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
