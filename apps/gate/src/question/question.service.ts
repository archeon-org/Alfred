import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RagUserContext } from '../common/rag-user-context';

export type QuestionAgentMode = 'normal' | 'reasoning';

interface RawCitation {
  chunk_id: string;
  document_id: string;
  snippet: string;
  score: number;
  start_offset: number;
  end_offset: number;
}

export interface QuestionResponse {
  answer: string;
  citations: Array<{
    chunkId: string;
    documentId: string;
    snippet: string;
    score: number;
    startOffset: number;
    endOffset: number;
  }>;
  processingTimeMs: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface QuestionOptions {
  maxContextResults?: number;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  agentMode?: QuestionAgentMode;
  userContext?: RagUserContext;
}

@Injectable()
export class QuestionService {
  private readonly logger = new Logger(QuestionService.name);
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

    if (!this.enabled) {
      this.logger.warn('INTERNAL_API_KEY not set - Question API disabled.');
    } else {
      this.logger.log(
        `Question API enabled, Scribe API at ${this.scribeApiUrl}`,
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
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

  async ask(
    userId: string,
    question: string,
    options: QuestionOptions = {},
  ): Promise<QuestionResponse> {
    if (!this.enabled) {
      throw new Error('Question API is not configured');
    }

    const url = `${this.scribeApiUrl}/api/rag/question`;

    this.logger.log(
      `Asking question for user ${userId}: "${question.slice(0, 50)}..."`,
    );

    try {
      const response = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          question,
          user_id: userId,
          max_context_results: options.maxContextResults || 15,
          conversation_history: options.conversationHistory,
          agent_mode: options.agentMode || 'normal',
          user_context: options.userContext,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Question API error: ${response.status} - ${errorText}`,
        );
        throw new Error(`Question API failed: ${response.status}`);
      }

      const data = await response.json();
      const rawCitations: RawCitation[] = Array.isArray(data.citations)
        ? data.citations
        : [];

      this.logger.log(
        `Question answered in ${data.processing_time_ms}ms, confidence=${data.confidence}`,
      );

      return {
        answer: data.answer,
        citations: rawCitations.map((citation) => ({
          chunkId: citation.chunk_id,
          documentId: citation.document_id,
          snippet: citation.snippet,
          score: citation.score,
          startOffset: citation.start_offset,
          endOffset: citation.end_offset,
        })),
        processingTimeMs: data.processing_time_ms,
        confidence: data.confidence,
      };
    } catch (error) {
      this.logger.error(`Question API request failed: ${error}`);
      throw error;
    }
  }

  async quickAnswer(
    userId: string,
    question: string,
    userContext?: RagUserContext,
  ): Promise<{ answer: string; confidence: string }> {
    if (!this.enabled) {
      throw new Error('Question API is not configured');
    }

    const url = `${this.scribeApiUrl}/api/rag/question`;

    try {
      const response = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          question,
          user_id: userId,
          agent_mode: 'normal',
          user_context: userContext,
        }),
      });

      if (!response.ok) {
        throw new Error(`Quick answer failed: ${response.status}`);
      }

      const data = await response.json();
      return {
        answer: data.answer,
        confidence: data.confidence,
      };
    } catch (error) {
      this.logger.error(`Quick answer request failed: ${error}`);
      throw error;
    }
  }

  async stream(
    userId: string,
    question: string,
    options: QuestionOptions = {},
    signal?: AbortSignal,
  ): Promise<Response | null> {
    if (!this.enabled) {
      return null;
    }

    const url = `${this.scribeApiUrl}/api/rag/question/stream`;
    try {
      return await this.fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          question,
          user_id: userId,
          max_context_results: options.maxContextResults || 15,
          conversation_history: options.conversationHistory,
          agent_mode: options.agentMode || 'normal',
          user_context: options.userContext,
        }),
        signal,
      });
    } catch (error) {
      this.logger.error(`Question stream request failed: ${error}`);
      return null;
    }
  }
}
