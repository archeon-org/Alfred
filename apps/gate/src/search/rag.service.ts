import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RagUserContext } from '../common/rag-user-context';

export type RagSearchMode = 'hybrid' | 'semantic' | 'keyword';
export type RagAgentMode = 'normal' | 'reasoning';

interface ScribeRagCitation {
  chunk_id: string;
  document_id: string;
  snippet: string;
  score: number;
  start_offset: number;
  end_offset: number;
}

export interface RagCitation {
  chunkId: string;
  documentId: string;
  snippet: string;
  score: number;
  startOffset: number;
  endOffset: number;
}

export interface RagDocumentResult {
  document_id: string;
  score: number;
  best_snippet: string;
  citations: RagCitation[];
}

interface ScribeRagDocumentResult {
  document_id: string;
  score: number;
  best_snippet: string;
  citations: ScribeRagCitation[];
}

export interface RagDocumentSearchResponse {
  query: string;
  user_id: string;
  count: number;
  documents: ScribeRagDocumentResult[];
  processing_time_ms: number;
}

interface ScribeRagAnswerResponse {
  answer: string;
  citations: ScribeRagCitation[];
  processing_time_ms: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface RagAnswerResponse {
  answer: string;
  citations: RagCitation[];
  processing_time_ms: number;
  confidence: 'high' | 'medium' | 'low';
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly scribeApiUrl: string;
  private readonly internalApiKey: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.scribeApiUrl =
      this.configService.get<string>('SCRIBE_API_URL') ||
      'http://archeon-scribe-api:8000';
    this.internalApiKey =
      this.configService.get<string>('INTERNAL_API_KEY') || '';
    this.enabled = !!this.internalApiKey;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private normalizeCitation(citation: ScribeRagCitation): RagCitation {
    return {
      chunkId: citation.chunk_id,
      documentId: citation.document_id,
      snippet: citation.snippet,
      score: citation.score,
      startOffset: citation.start_offset,
      endOffset: citation.end_offset,
    };
  }

  private normalizeAnswerResponse(
    data: ScribeRagAnswerResponse,
  ): RagAnswerResponse {
    return {
      answer: data.answer,
      citations: (data.citations || []).map((citation) =>
        this.normalizeCitation(citation),
      ),
      processing_time_ms: data.processing_time_ms,
      confidence: data.confidence,
    };
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    attempts: number = 3,
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await fetch(url, init);
        if (
          attempt < attempts &&
          [429, 500, 502, 503, 504].includes(response.status)
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, 200 * 2 ** (attempt - 1)),
          );
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt >= attempts) {
          break;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 200 * 2 ** (attempt - 1)),
        );
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Fetch failed');
  }

  async searchDocuments(
    userId: string,
    query: string,
    limit: number = 10,
    mode: RagSearchMode = 'hybrid',
    agentMode: RagAgentMode = 'normal',
    userContext?: RagUserContext,
  ): Promise<RagDocumentResult[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.scribeApiUrl}/api/rag/search/documents`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-API-Key': this.internalApiKey,
          },
          body: JSON.stringify({
            query,
            user_id: userId,
            limit,
            mode,
            agent_mode: agentMode,
            user_context: userContext,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `RAG document search error: ${response.status} - ${errorText}`,
        );
        return [];
      }

      const data: RagDocumentSearchResponse = await response.json();
      return (data.documents || []).map((document) => ({
        document_id: document.document_id,
        score: document.score,
        best_snippet: document.best_snippet,
        citations: (document.citations || []).map((citation) =>
          this.normalizeCitation(citation),
        ),
      }));
    } catch (error) {
      this.logger.error(`RAG document search failed: ${error}`);
      return [];
    }
  }

  async chat(
    userId: string,
    message: string,
    conversationHistory?: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
    limit: number = 10,
    agentMode: RagAgentMode = 'normal',
    userContext?: RagUserContext,
  ): Promise<RagAnswerResponse | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.scribeApiUrl}/api/rag/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-API-Key': this.internalApiKey,
          },
          body: JSON.stringify({
            message,
            user_id: userId,
            conversation_history: conversationHistory,
            max_context_results: limit,
            agent_mode: agentMode,
            user_context: userContext,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`RAG chat error: ${response.status} - ${errorText}`);
        return null;
      }

      const data = (await response.json()) as ScribeRagAnswerResponse;
      return this.normalizeAnswerResponse(data);
    } catch (error) {
      this.logger.error(`RAG chat failed: ${error}`);
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
    maxContextResults: number = 15,
    agentMode: RagAgentMode = 'normal',
    userContext?: RagUserContext,
  ): Promise<RagAnswerResponse | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.scribeApiUrl}/api/rag/question`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-API-Key': this.internalApiKey,
          },
          body: JSON.stringify({
            question,
            user_id: userId,
            conversation_history: conversationHistory,
            max_context_results: maxContextResults,
            agent_mode: agentMode,
            user_context: userContext,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `RAG question error: ${response.status} - ${errorText}`,
        );
        return null;
      }

      const data = (await response.json()) as ScribeRagAnswerResponse;
      return this.normalizeAnswerResponse(data);
    } catch (error) {
      this.logger.error(`RAG question failed: ${error}`);
      return null;
    }
  }

  async chatStream(
    userId: string,
    message: string,
    conversationHistory?: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
    maxContextResults: number = 15,
    agentMode: RagAgentMode = 'normal',
    signal?: AbortSignal,
    userContext?: RagUserContext,
  ): Promise<Response | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      return await this.fetchWithRetry(
        `${this.scribeApiUrl}/api/rag/chat/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-API-Key': this.internalApiKey,
          },
          body: JSON.stringify({
            message,
            user_id: userId,
            conversation_history: conversationHistory,
            max_context_results: maxContextResults,
            agent_mode: agentMode,
            user_context: userContext,
          }),
          signal,
        },
      );
    } catch (error) {
      this.logger.error(`RAG chat stream failed: ${error}`);
      return null;
    }
  }

  async questionStream(
    userId: string,
    question: string,
    conversationHistory?: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
    maxContextResults: number = 15,
    agentMode: RagAgentMode = 'normal',
    signal?: AbortSignal,
    userContext?: RagUserContext,
  ): Promise<Response | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      return await this.fetchWithRetry(
        `${this.scribeApiUrl}/api/rag/question/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-API-Key': this.internalApiKey,
          },
          body: JSON.stringify({
            question,
            user_id: userId,
            conversation_history: conversationHistory,
            max_context_results: maxContextResults,
            agent_mode: agentMode,
            user_context: userContext,
          }),
          signal,
        },
      );
    } catch (error) {
      this.logger.error(`RAG question stream failed: ${error}`);
      return null;
    }
  }

  async triggerBackfill(
    requestedBy: string,
    batchSize: number = 100,
  ): Promise<{ status: string; details?: string } | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await fetch(`${this.scribeApiUrl}/api/rag/backfill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          requested_by: requestedBy,
          batch_size: batchSize,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `RAG backfill error: ${response.status} - ${errorText}`,
        );
        return null;
      }

      return (await response.json()) as { status: string; details?: string };
    } catch (error) {
      this.logger.error(`RAG backfill failed: ${error}`);
      return null;
    }
  }
}
