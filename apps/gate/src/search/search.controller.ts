import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { ThrottleSearch } from '../common/decorators/throttle.decorator';
import { Request } from 'express';
import { UserEntity } from '@archeon-org/database';
import { SearchService } from './search.service';
import { GraphitiSearchService } from './graphiti-search.service';
import {
  ChatSearchService,
  ChatMessage,
  ChatContext,
} from './chat-search.service';
import { SubscriptionService } from '../subscription/subscription.service';

interface SearchQueryDto {
  q: string;
  limit?: string;
  mode?: 'semantic' | 'hybrid';
}

interface SearchResponseItem {
  id: string;
  filename: string;
  originalName: string;
  title: string | null;
  description: string | null;
  thumbnailPath: string | null;
  categoryId: string | null;
  similarity: number;
  matchReason?: string;
  createdAt: Date;
}

interface SearchResponse {
  query: string;
  mode: string;
  count: number;
  results: SearchResponseItem[];
}

interface ChatRequestDto {
  message: string;
  conversationHistory?: ChatMessage[];
  context?: ChatContext;
}

interface ChatResponseDto {
  response: ChatMessage;
  context: ChatContext;
  graphContext?: string;
  searchLimitInfo?: {
    remainingSearches: number;
    bonusSearches: number;
    resetsAt: Date;
  };
}

interface ExcludeDocumentDto {
  documentId: string;
  context: ChatContext;
}

interface QuestionRequestDto {
  question: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface QuestionResponseDto {
  answer: string;
  sources: string[];
  confidence: 'high' | 'medium' | 'low';
  processingTimeMs: number;
}

@ApiTags('search')
@ApiBearerAuth('JWT-auth')
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly graphitiSearchService: GraphitiSearchService,
    private readonly chatSearchService: ChatSearchService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Get()
  @ThrottleSearch()
  @ApiOperation({
    summary: 'Search documents',
    description:
      'Search user documents using semantic, hybrid, graph, or keyword search modes.',
  })
  @ApiQuery({
    name: 'q',
    description: 'Search query (min 2 characters)',
    required: true,
    example: 'electricity bill from january',
  })
  @ApiQuery({
    name: 'limit',
    description: 'Maximum number of results (1-50)',
    required: false,
    example: '10',
  })
  @ApiQuery({
    name: 'mode',
    description: 'Search mode',
    required: false,
    enum: ['semantic', 'hybrid', 'graph', 'keyword'],
    example: 'hybrid',
  })
  @ApiOkResponse({
    description: 'Search results',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        mode: { type: 'string' },
        count: { type: 'number' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              filename: { type: 'string' },
              originalName: { type: 'string' },
              title: { type: 'string', nullable: true },
              description: { type: 'string', nullable: true },
              thumbnailPath: { type: 'string', nullable: true },
              categoryId: { type: 'string', nullable: true },
              similarity: { type: 'number', minimum: 0, maximum: 1 },
              matchReason: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiBadRequestResponse({ description: 'Invalid search query' })
  async search(
    @Req() req: Request,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResponse> {
    const user = req.user as UserEntity;

    if (!query.q || query.q.trim().length === 0) {
      throw new BadRequestException('Search query is required');
    }

    if (query.q.trim().length < 2) {
      throw new BadRequestException(
        'Search query must be at least 2 characters',
      );
    }

    const limit = Math.min(Math.max(parseInt(query.limit || '10', 10), 1), 50);
    const mode = query.mode || 'hybrid';

    const results = await this.searchService.hybridSearch(
      user.id,
      query.q.trim(),
      limit,
    );

    return {
      query: query.q.trim(),
      mode,
      count: results.length,
      results: results.map((r) => ({
        id: r.document.id,
        filename: r.document.filename,
        originalName: r.document.originalName,
        title: r.document.title,
        description: r.document.description,
        thumbnailPath: r.document.thumbnailPath,
        categoryId: r.document.categoryId,
        similarity: Math.round(r.similarity * 100) / 100,
        matchReason: r.matchReason,
        createdAt: r.document.createdAt,
      })),
    };
  }

  @Post('chat')
  @ThrottleSearch()
  @ApiOperation({
    summary: 'Chat-based document search',
    description:
      'Send a conversational message to search documents using AI. Uses knowledge graph for RAG-enhanced responses.',
  })
  @ApiBody({
    description: 'Chat request with message and optional conversation history',
    schema: {
      type: 'object',
      required: ['message'],
      properties: {
        message: {
          type: 'string',
          description: 'User message',
          example: 'Find my electricity bills from last month',
        },
        conversationHistory: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['user', 'assistant'] },
              content: { type: 'string' },
            },
          },
        },
        context: {
          type: 'object',
          description: 'Chat context from previous messages',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Chat response with search results and context',
    schema: {
      type: 'object',
      properties: {
        response: {
          type: 'object',
          properties: {
            role: { type: 'string', example: 'assistant' },
            content: { type: 'string' },
          },
        },
        context: { type: 'object' },
        graphContext: {
          type: 'string',
          description: 'Knowledge graph context for RAG',
        },
        searchLimitInfo: {
          type: 'object',
          properties: {
            remainingSearches: { type: 'number' },
            bonusSearches: { type: 'number' },
            resetsAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiForbiddenResponse({ description: 'Daily AI search limit reached' })
  @ApiBadRequestResponse({ description: 'Message is required' })
  async chat(
    @Req() req: Request,
    @Body() body: ChatRequestDto,
  ): Promise<ChatResponseDto> {
    const user = req.user as UserEntity;

    if (!body.message || body.message.trim().length === 0) {
      throw new BadRequestException('Message is required');
    }

    const searchLimit = await this.subscriptionService.useAiSearch(user.id);

    if (!searchLimit.allowed) {
      throw new ForbiddenException({
        message: 'Daily AI search limit reached',
        error: 'DAILY_SEARCH_LIMIT_EXCEEDED',
        resetsAt: searchLimit.resetsAt,
        remainingSearches: 0,
      });
    }

    const conversationHistory = body.conversationHistory || [];
    const context = body.context || this.chatSearchService.createContext();

    const { response, updatedContext, graphContext } =
      await this.chatSearchService.chat(
        user.id,
        body.message.trim(),
        conversationHistory,
        context,
      );

    return {
      response,
      context: updatedContext,
      graphContext,
      searchLimitInfo: {
        remainingSearches: searchLimit.remainingSearches,
        bonusSearches: searchLimit.bonusSearches,
        resetsAt: searchLimit.resetsAt,
      },
    };
  }

  @Post('chat/exclude')
  @ThrottleSearch()
  @ApiOperation({
    summary: 'Exclude document from chat results',
    description:
      'Mark a document to be excluded from current chat search session.',
  })
  @ApiBody({
    description: 'Document ID and current context',
    schema: {
      type: 'object',
      required: ['documentId', 'context'],
      properties: {
        documentId: { type: 'string', format: 'uuid' },
        context: { type: 'object' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Updated context with excluded document',
    schema: {
      type: 'object',
      properties: {
        context: { type: 'object' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Document ID or context is required' })
  async excludeDocument(
    @Body() body: ExcludeDocumentDto,
  ): Promise<{ context: ChatContext }> {
    if (!body.documentId) {
      throw new BadRequestException('Document ID is required');
    }

    if (!body.context) {
      throw new BadRequestException('Context is required');
    }

    const updatedContext = this.chatSearchService.excludeDocument(
      body.context,
      body.documentId,
    );

    return { context: updatedContext };
  }

  @Post('question')
  @ThrottleSearch()
  @ApiOperation({
    summary: 'Ask Second Brain question',
    description:
      'Backward-compatible question endpoint. Proxies question requests to Scribe API.',
  })
  @ApiBody({
    description: 'Question request',
    schema: {
      type: 'object',
      required: ['question'],
      properties: {
        question: { type: 'string', example: 'What contracts did I sign?' },
        conversationHistory: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['user', 'assistant'] },
              content: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Question answered successfully',
    schema: {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        sources: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        processingTimeMs: { type: 'number' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid question' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiForbiddenResponse({ description: 'Daily AI search limit reached' })
  async question(
    @Req() req: Request,
    @Body() body: QuestionRequestDto,
  ): Promise<QuestionResponseDto> {
    const user = req.user as UserEntity;

    if (!body.question || body.question.trim().length < 3) {
      throw new BadRequestException(
        'Question must be at least 3 characters long',
      );
    }

    if (body.question.trim().length > 2000) {
      throw new BadRequestException(
        'Question must be less than 2000 characters',
      );
    }

    const searchLimit = await this.subscriptionService.useAiSearch(user.id);
    if (!searchLimit.allowed) {
      throw new ForbiddenException({
        message: 'Daily AI search limit reached',
        error: 'DAILY_SEARCH_LIMIT_EXCEEDED',
        resetsAt: searchLimit.resetsAt,
        remainingSearches: 0,
      });
    }

    const result = await this.graphitiSearchService.askQuestion(
      user.id,
      body.question.trim(),
      body.conversationHistory,
    );

    if (!result) {
      throw new BadRequestException('Failed to process your question');
    }

    return {
      answer: result.answer,
      sources: result.sources,
      confidence: result.confidence,
      processingTimeMs: result.processingTimeMs,
    };
  }
}
