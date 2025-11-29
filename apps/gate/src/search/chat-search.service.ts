import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEntity, CategoryEntity } from '@archeon-org/database';
import { SearchService, SearchResult } from './search.service';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  documents?: DocumentSuggestion[];
  timestamp?: string;
}

export interface DocumentSuggestion {
  id: string;
  title: string | null;
  originalName: string;
  categoryName: string | null;
  categoryColor: string | null;
  thumbnailPath: string | null;
  similarity: number;
  createdAt: Date;
}

export interface ChatContext {
  excludedDocumentIds: string[];
  refinements: string[];
  lastQuery: string;
  failedAttempts: number;
  searchAttempts: number; // Number of search queries made in this conversation
}

// Zod schema for AI chat response with structured output
const ChatResponseSchema = z.object({
  message: z
    .string()
    .describe(
      'Your conversational response to the user. Keep it short (1-2 sentences) unless asking clarifying questions.',
    ),
  searchQuery: z
    .string()
    .nullable()
    .describe(
      'The search query to use for finding documents. Set to null if you need more information from the user first.',
    ),
  needsMoreInfo: z
    .boolean()
    .describe(
      'Set to true if you need more information to perform an effective search.',
    ),
  refinementSuggestions: z
    .array(z.string())
    .nullish()
    .describe(
      'Optional suggestions for how the user could refine their search, e.g., "from last month", "with a red logo".',
    ),
});

type AIResponse = z.infer<typeof ChatResponseSchema>;

@Injectable()
export class ChatSearchService {
  private readonly logger = new Logger(ChatSearchService.name);
  private readonly openai: OpenAI;
  private readonly chatModel = 'accounts/fireworks/models/deepseek-v3-0324';

  constructor(
    private readonly configService: ConfigService,
    private readonly searchService: SearchService,
    @InjectRepository(DocumentEntity)
    private readonly documentRepository: Repository<DocumentEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
  ) {
    const apiKey = this.configService.get<string>('FIREWORKS_API_KEY') || '';
    this.openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.fireworks.ai/inference/v1',
    });
  }

  // Similarity thresholds
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.65; // Good match
  private readonly LOW_CONFIDENCE_THRESHOLD = 0.45; // Minimum to show
  private readonly MAX_SEARCH_ATTEMPTS_BEFORE_BEST_EFFORT = 3;

  /**
   * Process a chat message and return AI response with document suggestions
   */
  async chat(
    userId: string,
    userMessage: string,
    conversationHistory: ChatMessage[],
    context: ChatContext,
  ): Promise<{ response: ChatMessage; updatedContext: ChatContext }> {
    this.logger.log(`Chat search for user ${userId}: "${userMessage}"`);

    // Build the conversation for the AI
    const aiResponse = await this.getAIResponse(
      userMessage,
      conversationHistory,
      context,
    );

    let documents: DocumentSuggestion[] = [];
    let searchQuality: 'good' | 'low' | 'none' = 'none';
    let newSearchAttempts = context.searchAttempts;

    // If AI determined we should search, perform the search
    if (aiResponse.searchQuery) {
      newSearchAttempts++;

      // Fetch more results initially, we'll filter them
      const searchResults = await this.searchService.hybridSearch(
        userId,
        aiResponse.searchQuery,
        10,
      );

      // Filter out excluded documents
      const filteredResults = searchResults.filter(
        (r) => !context.excludedDocumentIds.includes(r.document.id),
      );

      // Categorize results by quality
      const highConfidenceResults = filteredResults.filter(
        (r) => r.similarity >= this.HIGH_CONFIDENCE_THRESHOLD,
      );
      const lowConfidenceResults = filteredResults.filter(
        (r) =>
          r.similarity >= this.LOW_CONFIDENCE_THRESHOLD &&
          r.similarity < this.HIGH_CONFIDENCE_THRESHOLD,
      );

      // Determine which results to show based on quality and attempt count
      if (highConfidenceResults.length > 0) {
        // We have good matches - show them
        documents = await this.enrichDocumentsWithCategories(
          highConfidenceResults.slice(0, 3),
        );
        searchQuality = 'good';
      } else if (
        newSearchAttempts >= this.MAX_SEARCH_ATTEMPTS_BEFORE_BEST_EFFORT &&
        lowConfidenceResults.length > 0
      ) {
        // After 3 attempts, show best effort results with disclaimer
        documents = await this.enrichDocumentsWithCategories(
          lowConfidenceResults.slice(0, 3),
        );
        searchQuality = 'low';
      } else if (lowConfidenceResults.length > 0) {
        // Low confidence results exist but we haven't exhausted attempts
        // Don't show them yet, ask for more details
        searchQuality = 'low';
      } else {
        searchQuality = 'none';
      }
    }

    // Adjust the AI message based on search quality
    let finalMessage = aiResponse.message;
    if (aiResponse.searchQuery) {
      finalMessage = this.adjustMessageForSearchQuality(
        aiResponse.message,
        searchQuality,
        documents.length,
        newSearchAttempts,
      );
    }

    // Build the response message
    const responseMessage: ChatMessage = {
      role: 'assistant',
      content: finalMessage,
      documents: documents.length > 0 ? documents : undefined,
      timestamp: new Date().toISOString(),
    };

    // Update context
    const updatedContext: ChatContext = {
      ...context,
      lastQuery: aiResponse.searchQuery || context.lastQuery,
      refinements: aiResponse.searchQuery
        ? [...context.refinements, userMessage]
        : context.refinements,
      searchAttempts: newSearchAttempts,
    };

    return { response: responseMessage, updatedContext };
  }

  /**
   * Adjust the message based on search quality
   */
  private adjustMessageForSearchQuality(
    originalMessage: string,
    quality: 'good' | 'low' | 'none',
    resultCount: number,
    attempts: number,
  ): string {
    if (quality === 'good' && resultCount > 0) {
      // Good results - use original message or a positive one
      return (
        originalMessage ||
        'Here are some documents that match your description:'
      );
    }

    if (quality === 'low' && resultCount > 0) {
      // Showing best-effort results after multiple attempts
      return `I couldn't find an exact match, but here are the closest documents I found. These might not be exactly what you're looking for:`;
    }

    if (
      quality === 'low' &&
      resultCount === 0 &&
      attempts < this.MAX_SEARCH_ATTEMPTS_BEFORE_BEST_EFFORT
    ) {
      // Low quality results exist but we're not showing them yet
      return `I'm having trouble finding that specific document. Could you give me more details? For example, do you remember any text on the document, the approximate date, or what type of document it is (bill, contract, letter, etc.)?`;
    }

    if (quality === 'none') {
      if (attempts >= this.MAX_SEARCH_ATTEMPTS_BEFORE_BEST_EFFORT) {
        return `I couldn't find any documents matching your description. It's possible the document hasn't been uploaded yet, or the description doesn't match the document content. Would you like to try a different search?`;
      }
      return `I couldn't find documents matching that description. Could you describe it differently or provide more details like the date, sender, or any specific text you remember from the document?`;
    }

    return originalMessage;
  }

  /**
   * Mark a document as "not what I'm looking for" and increment failed attempts
   */
  excludeDocument(context: ChatContext, documentId: string): ChatContext {
    return {
      ...context,
      excludedDocumentIds: [...context.excludedDocumentIds, documentId],
      failedAttempts: context.failedAttempts + 1,
    };
  }

  /**
   * Get AI response based on conversation using structured output
   */
  private async getAIResponse(
    userMessage: string,
    history: ChatMessage[],
    context: ChatContext,
  ): Promise<AIResponse> {
    // Sanitize refinements to prevent prompt injection
    const sanitizedRefinements = context.refinements
      .map((r) => r.replace(/[^\w\s.,!?-]/g, '').slice(0, 100))
      .join(', ');

    const isDeepQuestioning = context.failedAttempts >= 2;

    const systemPrompt = `You are a helpful document search assistant. Your job is to help users find documents in their personal document archive.

Your role:
1. Understand what document the user is looking for
2. Ask clarifying questions if needed (but don't be annoying - if you have enough info, search!)
3. Generate search queries based on the user's description
4. Help narrow down results based on user feedback

Rules:
- Be conversational and friendly, but concise
- If the user describes a document, generate a search query
- If the user says "not that one" or similar, acknowledge and ask for more details
- If the user provides feedback like "more recent" or "the blue one", incorporate it into your next search
- Keep responses short - 1-2 sentences max unless asking clarifying questions
${isDeepQuestioning ? '\n- The user has rejected documents multiple times. Ask more specific questions about document details like dates, colors, specific text, or document type.' : ''}

Previous refinements in this conversation: ${sanitizedRefinements || 'none'}
Documents already rejected: ${context.excludedDocumentIds.length}

IMPORTANT: You MUST respond with valid JSON only. No markdown, no code blocks, no explanations outside the JSON structure.`;

    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [
      { role: 'system', content: systemPrompt },
      ...history.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content:
          msg.role === 'assistant'
            ? msg.content
            : msg.content +
              (msg.documents
                ? `\n[Showed ${msg.documents.length} documents]`
                : ''),
      })),
      { role: 'user', content: userMessage },
    ];

    try {
      const response = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages,
        temperature: 0.1, // Low temperature for deterministic search queries
        max_tokens: 500,
        response_format: zodResponseFormat(ChatResponseSchema, 'chat_response'),
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        this.logger.warn('No content from AI, using fallback');
        return this.getFallbackResponse(userMessage);
      }

      // Parse and validate the response
      const parsed = JSON.parse(content);
      const validated = ChatResponseSchema.parse(parsed);

      return {
        message: validated.message || "I'll help you find that document.",
        searchQuery: validated.searchQuery,
        needsMoreInfo: validated.needsMoreInfo,
        refinementSuggestions: validated.refinementSuggestions,
      };
    } catch (error) {
      this.logger.error('AI request failed', error);
      return this.getFallbackResponse(userMessage);
    }
  }

  /**
   * Fallback response when AI fails
   */
  private getFallbackResponse(userMessage: string): AIResponse {
    return {
      message: 'Let me search for that...',
      searchQuery: userMessage,
      needsMoreInfo: false,
      refinementSuggestions: undefined,
    };
  }

  /**
   * Enrich search results with category information
   */
  private async enrichDocumentsWithCategories(
    results: SearchResult[],
  ): Promise<DocumentSuggestion[]> {
    if (results.length === 0) return [];

    // Get unique category IDs
    const categoryIds = [
      ...new Set(
        results
          .map((r) => r.document.categoryId)
          .filter((id): id is string => id !== null),
      ),
    ];

    // Fetch categories
    const categories =
      categoryIds.length > 0
        ? await this.categoryRepository.findByIds(categoryIds)
        : [];

    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    return results.map((r) => {
      const category = r.document.categoryId
        ? categoryMap.get(r.document.categoryId)
        : null;

      return {
        id: r.document.id,
        title: r.document.title,
        originalName: r.document.originalName,
        categoryName: category?.name || null,
        categoryColor: category?.color || null,
        thumbnailPath: r.document.thumbnailPath,
        similarity: r.similarity,
        createdAt: r.document.createdAt,
      };
    });
  }

  /**
   * Initialize a new chat context
   */
  createContext(): ChatContext {
    return {
      excludedDocumentIds: [],
      refinements: [],
      lastQuery: '',
      failedAttempts: 0,
      searchAttempts: 0,
    };
  }
}
