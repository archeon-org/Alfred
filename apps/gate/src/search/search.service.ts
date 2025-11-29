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
   * Comprehensive keyword search - searches across all text fields
   * Includes: title, originalName, description, content (OCR), and metadata
   */
  private async comprehensiveKeywordSearch(
    userId: string,
    query: string,
    limit: number,
  ): Promise<SearchResult[]> {
    // Tokenize and clean search terms
    const searchTerms = this.tokenizeQuery(query);

    if (searchTerms.length === 0) {
      return [];
    }

    this.logger.log(`Keyword search with terms: ${searchTerms.join(', ')}`);

    // Build the comprehensive search query
    // We search each term against multiple fields and track which fields matched
    const results = await this.documentRepository.query(
      `
      SELECT 
        d.*,
        -- Track which fields matched for scoring
        CASE WHEN ${this.buildFieldMatchCondition('d."title"', searchTerms)} THEN true ELSE false END as title_match,
        CASE WHEN ${this.buildFieldMatchCondition('d."originalName"', searchTerms)} THEN true ELSE false END as name_match,
        CASE WHEN ${this.buildFieldMatchCondition('d."description"', searchTerms)} THEN true ELSE false END as description_match,
        CASE WHEN ${this.buildFieldMatchCondition('d."content"', searchTerms)} THEN true ELSE false END as content_match,
        CASE WHEN ${this.buildMetadataMatchCondition(searchTerms)} THEN true ELSE false END as metadata_match,
        -- Calculate match score based on number of matching fields
        (
          CASE WHEN ${this.buildFieldMatchCondition('d."title"', searchTerms)} THEN 3 ELSE 0 END +
          CASE WHEN ${this.buildFieldMatchCondition('d."originalName"', searchTerms)} THEN 2 ELSE 0 END +
          CASE WHEN ${this.buildFieldMatchCondition('d."description"', searchTerms)} THEN 1 ELSE 0 END +
          CASE WHEN ${this.buildFieldMatchCondition('d."content"', searchTerms)} THEN 2 ELSE 0 END +
          CASE WHEN ${this.buildMetadataMatchCondition(searchTerms)} THEN 1 ELSE 0 END
        ) as match_score
      FROM "documents" d
      WHERE d."userId" = $1
        AND d."deletedAt" IS NULL
        AND (
          ${this.buildFieldMatchCondition('d."title"', searchTerms)}
          OR ${this.buildFieldMatchCondition('d."originalName"', searchTerms)}
          OR ${this.buildFieldMatchCondition('d."description"', searchTerms)}
          OR ${this.buildFieldMatchCondition('d."content"', searchTerms)}
          OR ${this.buildMetadataMatchCondition(searchTerms)}
        )
      ORDER BY match_score DESC, d."createdAt" DESC
      LIMIT $2
      `,
      [userId, limit],
    );

    return results.map((row: any) => ({
      document: this.mapRowToDocument(row),
      similarity: this.normalizeKeywordScore(row.match_score),
      matchReason: 'keyword',
      matchDetails: {
        titleMatch: row.title_match || row.name_match,
        contentMatch: row.content_match,
        descriptionMatch: row.description_match,
        metadataMatch: row.metadata_match,
      },
    }));
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
   * Build SQL condition for matching any term in a field
   */
  private buildFieldMatchCondition(field: string, terms: string[]): string {
    if (terms.length === 0) return 'false';

    const conditions = terms.map(
      (term) =>
        `LOWER(COALESCE(${field}, '')) LIKE '%${this.escapeSqlLike(term)}%'`,
    );

    return `(${conditions.join(' OR ')})`;
  }

  /**
   * Build SQL condition for matching terms in JSONB metadata
   */
  private buildMetadataMatchCondition(terms: string[]): string {
    if (terms.length === 0) return 'false';

    // Cast metadata to text and search
    const conditions = terms.map(
      (term) =>
        `LOWER(COALESCE(d."metadata"::text, '')) LIKE '%${this.escapeSqlLike(term)}%'`,
    );

    return `(${conditions.join(' OR ')})`;
  }

  /**
   * Escape special characters for SQL LIKE
   */
  private escapeSqlLike(str: string): string {
    return str.replace(/[%_\\]/g, '\\$&');
  }

  /**
   * Normalize keyword match score to 0-1 range
   */
  private normalizeKeywordScore(score: number): number {
    // Max possible score is 9 (3+2+1+2+1)
    return Math.min(1, score / 9);
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
   * Legacy keyword search - kept for backwards compatibility
   * @deprecated Use comprehensiveKeywordSearch instead
   */
  private async keywordSearch(
    userId: string,
    query: string,
    limit: number,
  ): Promise<SearchResult[]> {
    return this.comprehensiveKeywordSearch(userId, query, limit);
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
