import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface QuestionResponse {
  answer: string;
  contextUsed: string;
  sources: string[];
  processingTimeMs: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface QuestionOptions {
  maxContextResults?: number;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
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

  async ask(
    userId: string,
    question: string,
    options: QuestionOptions = {},
  ): Promise<QuestionResponse> {
    if (!this.enabled) {
      throw new Error('Question API is not configured');
    }

    const url = `${this.scribeApiUrl}/api/question/`;

    this.logger.log(
      `Asking question for user ${userId}: "${question.slice(0, 50)}..."`,
    );

    try {
      const response = await fetch(url, {
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
      this.logger.error(`Question API request failed: ${error}`);
      throw error;
    }
  }

  async quickAnswer(
    userId: string,
    question: string,
  ): Promise<{ answer: string; confidence: string }> {
    if (!this.enabled) {
      throw new Error('Question API is not configured');
    }

    const url = `${this.scribeApiUrl}/api/question/quick`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          question,
          user_id: userId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Quick answer failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`Quick answer request failed: ${error}`);
      throw error;
    }
  }
}
