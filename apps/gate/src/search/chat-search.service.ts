import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEntity, CategoryEntity } from '@archeon-org/database';
import { SearchService, SearchResult } from './search.service';
import { GraphitiSearchService } from './graphiti-search.service';
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
  searchAttempts: number;
}

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
  private readonly chatModel = 'accounts/fireworks/models/deepseek-v3p1';

  constructor(
    private readonly configService: ConfigService,
    private readonly searchService: SearchService,
    private readonly graphitiSearchService: GraphitiSearchService,
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

  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.55;
  private readonly LOW_CONFIDENCE_THRESHOLD = 0.35;

  async chat(
    userId: string,
    userMessage: string,
    conversationHistory: ChatMessage[],
    context: ChatContext,
  ): Promise<{
    response: ChatMessage;
    updatedContext: ChatContext;
    graphContext?: string;
  }> {
    this.logger.log(`Chat search for user ${userId}: "${userMessage}"`);

    const aiResponse = await this.getAIResponse(
      userMessage,
      conversationHistory,
      context,
    );

    let documents: DocumentSuggestion[] = [];
    let searchQuality: 'good' | 'low' | 'none' = 'none';
    let newSearchAttempts = context.searchAttempts;
    let graphContext: string | undefined;

    if (aiResponse.searchQuery) {
      newSearchAttempts++;

      const graphitiResult = await this.graphitiSearchService.chatSearch(
        userId,
        aiResponse.searchQuery,
        { limit: 10 },
      );

      if (graphitiResult && graphitiResult.context) {
        graphContext = graphitiResult.context;
        this.logger.log(
          `Graphiti returned context: ${graphitiResult.entityCount} entities, ${graphitiResult.factCount} facts`,
        );
      }

      const searchResults = await this.searchService.hybridSearch(
        userId,
        aiResponse.searchQuery,
        10,
      );

      const filteredResults = searchResults.filter(
        (r) => !context.excludedDocumentIds.includes(r.document.id),
      );

      const highConfidenceResults = filteredResults.filter(
        (r) => r.similarity >= this.HIGH_CONFIDENCE_THRESHOLD,
      );
      const lowConfidenceResults = filteredResults.filter(
        (r) =>
          r.similarity >= this.LOW_CONFIDENCE_THRESHOLD &&
          r.similarity < this.HIGH_CONFIDENCE_THRESHOLD,
      );

      if (highConfidenceResults.length > 0) {
        documents = await this.enrichDocumentsWithCategories(
          highConfidenceResults.slice(0, 3),
        );
        searchQuality = 'good';
      } else if (lowConfidenceResults.length > 0) {
        documents = await this.enrichDocumentsWithCategories(
          lowConfidenceResults.slice(0, 3),
        );
        searchQuality = 'low';
      } else {
        searchQuality = 'none';
      }
    }

    let finalMessage = aiResponse.message;
    if (aiResponse.searchQuery) {
      finalMessage = this.adjustMessageForSearchQuality(
        aiResponse.message,
        searchQuality,
        documents.length,
      );
    }

    const responseMessage: ChatMessage = {
      role: 'assistant',
      content: finalMessage,
      documents: documents.length > 0 ? documents : undefined,
      timestamp: new Date().toISOString(),
    };

    const updatedContext: ChatContext = {
      ...context,
      lastQuery: aiResponse.searchQuery || context.lastQuery,
      refinements: aiResponse.searchQuery
        ? [...context.refinements, userMessage]
        : context.refinements,
      searchAttempts: newSearchAttempts,
    };

    return { response: responseMessage, updatedContext, graphContext };
  }

  private adjustMessageForSearchQuality(
    originalMessage: string,
    quality: 'good' | 'low' | 'none',
    resultCount: number,
  ): string {
    if (quality === 'good' && resultCount > 0) {
      return (
        originalMessage ||
        'Here are some documents that match your description:'
      );
    }

    if (quality === 'low' && resultCount > 0) {
      return (
        originalMessage ||
        'Here are the closest matches I found. Let me know if you need something more specific:'
      );
    }

    if (quality === 'none') {
      return `I couldn't find any documents matching your description. It's possible the document hasn't been uploaded yet, or the description doesn't match the document content. Could you try describing it differently?`;
    }

    return originalMessage;
  }

  excludeDocument(context: ChatContext, documentId: string): ChatContext {
    return {
      ...context,
      excludedDocumentIds: [...context.excludedDocumentIds, documentId],
      failedAttempts: context.failedAttempts + 1,
    };
  }

  private async getAIResponse(
    userMessage: string,
    history: ChatMessage[],
    context: ChatContext,
  ): Promise<AIResponse> {
    const sanitizedRefinements = context.refinements
      .map((r) => r.replace(/[^\w\s.,!?-]/g, '').slice(0, 100))
      .join(', ');

    const isDeepQuestioning = context.failedAttempts >= 2;

    const systemPrompt = `You are a helpful document search assistant. Your job is to help users find documents in their personal document archive.

Your role:
1. Understand what document the user is looking for
2. Generate search queries based on the user's description
3. Show results immediately - the system has rich entity and relationship extraction
4. Help narrow down results based on user feedback

Rules:
- Be conversational and friendly, but concise
- If the user describes a document, ALWAYS generate a search query immediately
- Trust the search results - the system has comprehensive entity extraction (people, organizations, locations, dates, amounts, etc.)
- If the user says "not that one", acknowledge and incorporate their feedback into the next search
- Keep responses short - 1-2 sentences max
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
        temperature: 0.1,
        max_tokens: 500,
        response_format: zodResponseFormat(ChatResponseSchema, 'chat_response'),
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        this.logger.warn('No content from AI, using fallback');
        return this.getFallbackResponse(userMessage);
      }

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

  private getFallbackResponse(userMessage: string): AIResponse {
    return {
      message: 'Let me search for that...',
      searchQuery: userMessage,
      needsMoreInfo: false,
      refinementSuggestions: undefined,
    };
  }

  private async enrichDocumentsWithCategories(
    results: SearchResult[],
  ): Promise<DocumentSuggestion[]> {
    if (results.length === 0) return [];

    const categoryIds = [
      ...new Set(
        results
          .map((r) => r.document.categoryId)
          .filter((id): id is string => id !== null),
      ),
    ];

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
