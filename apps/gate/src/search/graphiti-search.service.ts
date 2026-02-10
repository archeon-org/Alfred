import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Search mode types supported by Graphiti
 */
export type GraphitiSearchMode = 'hybrid' | 'semantic' | 'keyword' | 'graph';

/**
 * Entity from knowledge graph
 */
export interface GraphitiEntity {
  uuid: string;
  name: string;
  summary: string | null;
  labels: string[];
}

/**
 * Fact/relationship from knowledge graph
 */
export interface GraphitiFact {
  uuid: string;
  fact: string;
  sourceUuid: string | null;
  targetUuid: string | null;
  createdAt: string | null;
}

/**
 * Community summary
 */
export interface GraphitiCommunity {
  name: string;
  summary: string | null;
}

/**
 * Response from Scribe Search API
 */
export interface GraphitiSearchResponse {
  query: string;
  mode: string;
  userId: string;
  count: number;
  entities: GraphitiEntity[];
  facts: GraphitiFact[];
  communities: GraphitiCommunity[];
  context: string | null;
  processingTimeMs: number;
}

/**
 * Chat search response from Scribe API
 */
export interface GraphitiChatResponse {
  query: string;
  context: string;
  entityCount: number;
  factCount: number;
  processingTimeMs: number;
}

/**
 * Document search result from Graphiti
 */
export interface GraphitiDocumentResult {
  document_id: string | null;
  filename: string;
  relevance: number;
  matched_entities: string[];
  reference_time: string | null;
}

export interface GraphitiDocumentSearchResponse {
  query: string;
  user_id: string;
  count: number;
  documents: GraphitiDocumentResult[];
  processing_time_ms: number;
}

export interface GraphitiSearchResult {
  entities: GraphitiEntity[];
  facts: GraphitiFact[];
  communities: GraphitiCommunity[];
  context: string;
  processingTimeMs: number;
}

@Injectable()
export class GraphitiSearchService {
  private readonly logger = new Logger(GraphitiSearchService.name);
  private readonly scribeApiUrl: string;
  private readonly internalApiKey: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    // Scribe API runs on port 8000 inside Docker network
    // Container name: archeon-scribe-api (or scribe-api depending on compose file)
    this.scribeApiUrl =
      this.configService.get<string>('SCRIBE_API_URL') ||
      'http://archeon-scribe-api:8000';
    this.internalApiKey =
      this.configService.get<string>('INTERNAL_API_KEY') || '';
    this.enabled = !!this.internalApiKey;

    if (!this.enabled) {
      this.logger.warn('INTERNAL_API_KEY not set - Graphiti search disabled.');
    } else {
      this.logger.log(
        `Graphiti search enabled, Scribe API at ${this.scribeApiUrl}`,
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async searchDocuments(
    userId: string,
    query: string,
    limit: number = 10,
  ): Promise<GraphitiDocumentResult[]> {
    if (!this.enabled) {
      this.logger.warn('Graphiti search disabled, returning empty results');
      return [];
    }

    const url = `${this.scribeApiUrl}/api/search/documents`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          query,
          user_id: userId,
          limit,
          mode: 'hybrid', // Default mode
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Graphiti document search error: ${response.status} - ${errorText}`,
        );
        return [];
      }

      const data: GraphitiDocumentSearchResponse = await response.json();
      return data.documents;
    } catch (error) {
      this.logger.error(`Graphiti document search request failed: ${error}`);
      return [];
    }
  }

  async search(
    userId: string,
    query: string,
    options: {
      mode?: GraphitiSearchMode;
      limit?: number;
      includeCommunities?: boolean;
    } = {},
  ): Promise<GraphitiSearchResult | null> {
    if (!this.enabled) {
      return null;
    }

    const { mode = 'hybrid', limit = 10, includeCommunities = false } = options;

    this.logger.log(
      `Graphiti search for user ${userId}: "${query}" (mode: ${mode})`,
    );

    try {
      const response = await fetch(`${this.scribeApiUrl}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          query,
          user_id: userId,
          mode,
          limit,
          include_communities: includeCommunities,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Scribe API error: ${response.status} - ${errorText}`,
        );
        return null;
      }

      const data: GraphitiSearchResponse = await response.json();

      this.logger.log(
        `Graphiti search returned ${data.entities.length} entities, ` +
          `${data.facts.length} facts in ${data.processingTimeMs}ms`,
      );

      return {
        entities: data.entities,
        facts: data.facts,
        communities: data.communities,
        context: data.context || '',
        processingTimeMs: data.processingTimeMs,
      };
    } catch (error) {
      this.logger.error(`Graphiti search failed: ${error}`);
      return null;
    }
  }

  async chatSearch(
    userId: string,
    message: string,
    options: {
      limit?: number;
      conversationContext?: string;
    } = {},
  ): Promise<GraphitiChatResponse | null> {
    if (!this.enabled) {
      return null;
    }

    const { limit = 10, conversationContext } = options;

    this.logger.log(`Graphiti chat search for user ${userId}: "${message}"`);

    try {
      const response = await fetch(`${this.scribeApiUrl}/api/search/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          message,
          user_id: userId,
          limit,
          conversation_context: conversationContext,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Scribe chat API error: ${response.status} - ${errorText}`,
        );
        return null;
      }

      const data: GraphitiChatResponse = await response.json();

      this.logger.log(
        `Graphiti chat search returned ${data.entityCount} entities, ` +
          `${data.factCount} facts in ${data.processingTimeMs}ms`,
      );

      return data;
    } catch (error) {
      this.logger.error(`Graphiti chat search failed: ${error}`);
      return null;
    }
  }

  async listUserEntities(
    userId: string,
    limit: number = 50,
  ): Promise<GraphitiEntity[] | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await fetch(
        `${this.scribeApiUrl}/api/search/entities/${userId}?limit=${limit}`,
        {
          method: 'GET',
          headers: {
            'X-Internal-API-Key': this.internalApiKey,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Scribe entities API error: ${response.status} - ${errorText}`,
        );
        return null;
      }

      const data = await response.json();
      return data.entities;
    } catch (error) {
      this.logger.error(`List entities failed: ${error}`);
      return null;
    }
  }

  async askQuestion(
    userId: string,
    question: string,
    conversationHistory?: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
  ): Promise<{
    answer: string;
    contextUsed: string;
    sources: string[];
    processingTimeMs: number;
    confidence: 'high' | 'medium' | 'low';
  } | null> {
    if (!this.enabled) {
      return null;
    }

    this.logger.log(`Second Brain question for user ${userId}: "${question}"`);

    try {
      const response = await fetch(`${this.scribeApiUrl}/api/question/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          question,
          user_id: userId,
          conversation_history: conversationHistory,
          max_context_results: 15,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Scribe question API error: ${response.status} - ${errorText}`,
        );
        return null;
      }

      const data = await response.json();

      this.logger.log(
        `Question answered in ${data.processing_time_ms}ms, confidence=${data.confidence}`,
      );

      return {
        answer: data.answer,
        contextUsed: data.context_used,
        sources: data.sources || [],
        processingTimeMs: data.processing_time_ms,
        confidence: data.confidence,
      };
    } catch (error) {
      this.logger.error(`Question failed: ${error}`);
      return null;
    }
  }
}
