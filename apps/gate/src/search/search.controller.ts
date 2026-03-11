import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Res,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ThrottleSearch } from '../common/decorators/throttle.decorator';
import { Request, Response } from 'express';
import { Readable } from 'stream';
import { UserEntity } from '@archeon-org/database';
import { buildRagUserContext } from '../common/rag-user-context';
import { SearchService } from './search.service';
import {
  ChatSearchService,
  ChatMessage,
  ChatContext,
} from './chat-search.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { RagCitation, RagService } from './rag.service';
import {
  ApiChatSearchDocs,
  ApiExcludeDocumentDocs,
  ApiQuestionSearchDocs,
  ApiSearchControllerDocs,
  ApiSearchDocumentsDocs,
} from './search.docs';
import {
  ChatRequestDto,
  ExcludeDocumentDto,
  QuestionRequestDto,
  SearchQueryDto,
} from './dto/search.dto';

interface SearchResponseItem {
  id: string;
  filename: string;
  originalName: string;
  title: string | null;
  description: string | null;
  thumbnailPath: string | null;
  categoryId: string | null;
  similarity: number;
  bestSnippet?: string;
  citations: RagCitation[];
  matchReason?: string;
  createdAt: Date;
}

interface SearchResponse {
  query: string;
  mode: string;
  count: number;
  results: SearchResponseItem[];
}

interface ChatResponseDto {
  response: ChatMessage;
  context: ChatContext;
  searchLimitInfo?: {
    remainingSearches: number;
    bonusSearches: number;
    resetsAt: Date;
  };
}

interface QuestionResponseDto {
  answer: string;
  citations: RagCitation[];
  confidence: 'high' | 'medium' | 'low';
  processingTimeMs: number;
}

interface UpstreamStreamCitation {
  chunk_id: string;
  document_id: string;
  snippet: string;
  score: number;
  start_offset: number;
  end_offset: number;
}

interface UpstreamEventPayload {
  type: 'event';
  stage?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

interface UpstreamResultPayload {
  type: 'result';
  answer?: string;
  citations?: UpstreamStreamCitation[];
  confidence?: 'high' | 'medium' | 'low';
  processing_time_ms?: number;
}

interface UpstreamErrorPayload {
  type: 'error';
  message?: string;
}

interface UpstreamAnswerDeltaPayload {
  type: 'answer_delta';
  delta?: string;
}

type UpstreamPayload =
  | UpstreamEventPayload
  | UpstreamResultPayload
  | UpstreamErrorPayload
  | UpstreamAnswerDeltaPayload;

@ApiSearchControllerDocs()
@Controller('search')
export class SearchController {
  private static readonly MAX_STREAMS_PER_USER = 3;
  private static readonly activeStreamsByUser = new Map<string, number>();

  constructor(
    private readonly searchService: SearchService,
    private readonly ragService: RagService,
    private readonly chatSearchService: ChatSearchService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Get()
  @ThrottleSearch()
  @ApiSearchDocumentsDocs()
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

    const limit = Math.min(Math.max(query.limit ?? 10, 1), 50);
    const mode = query.mode || 'hybrid';

    const results = await this.searchService.hybridSearch(
      user.id,
      query.q.trim(),
      limit,
      mode,
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
        bestSnippet: r.bestSnippet,
        citations: r.citations,
        matchReason: r.matchReason,
        createdAt: r.document.createdAt,
      })),
    };
  }

  @Post('chat')
  @ThrottleSearch()
  @ApiChatSearchDocs()
  async chat(
    @Req() req: Request,
    @Body() body: ChatRequestDto,
  ): Promise<ChatResponseDto> {
    const user = req.user as UserEntity;
    const userContext = buildRagUserContext(user, req);

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

    const conversationHistory = (body.conversationHistory ||
      []) as ChatMessage[];
    const context = body.context || this.chatSearchService.createContext();

    const { response, updatedContext } = await this.chatSearchService.chat(
      user.id,
      body.message.trim(),
      conversationHistory,
      context,
      body.agentMode || 'normal',
      userContext,
    );

    return {
      response,
      context: updatedContext,
      searchLimitInfo: {
        remainingSearches: searchLimit.remainingSearches,
        bonusSearches: searchLimit.bonusSearches,
        resetsAt: searchLimit.resetsAt,
      },
    };
  }

  @Post('chat/exclude')
  @ThrottleSearch()
  @ApiExcludeDocumentDocs()
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
  @ApiQuestionSearchDocs()
  async question(
    @Req() req: Request,
    @Body() body: QuestionRequestDto,
  ): Promise<QuestionResponseDto> {
    const user = req.user as UserEntity;
    const userContext = buildRagUserContext(user, req);

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

    const result = await this.ragService.askQuestion(
      user.id,
      body.question.trim(),
      body.conversationHistory,
      15,
      body.agentMode || 'normal',
      userContext,
    );

    if (!result) {
      throw new BadRequestException('Failed to process your question');
    }

    return {
      answer: result.answer,
      citations: result.citations,
      confidence: result.confidence,
      processingTimeMs: result.processing_time_ms,
    };
  }

  @Post('chat/stream')
  @ThrottleSearch()
  async chatStream(
    @Req() req: Request,
    @Body() body: ChatRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    const user = req.user as UserEntity;
    const userContext = buildRagUserContext(user, req);

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

    const conversationHistory = (body.conversationHistory ||
      []) as ChatMessage[];
    const context = body.context || this.chatSearchService.createContext();
    const releaseStreamSlot = this.acquireStreamSlot(user.id);
    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    res.on('close', onClose);

    try {
      const streamResponse = await this.ragService.chatStream(
        user.id,
        body.message.trim(),
        conversationHistory.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        15,
        body.agentMode || 'normal',
        abortController.signal,
        userContext,
      );

      await this.pipeChatNdjsonStream(
        res,
        streamResponse,
        user.id,
        body.message.trim(),
        context,
        searchLimit,
      );
    } finally {
      res.off('close', onClose);
      releaseStreamSlot();
    }
  }

  @Post('question/stream')
  @ThrottleSearch()
  async questionStream(
    @Req() req: Request,
    @Body() body: QuestionRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    const user = req.user as UserEntity;
    const userContext = buildRagUserContext(user, req);

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

    const releaseStreamSlot = this.acquireStreamSlot(user.id);
    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    res.on('close', onClose);

    try {
      const streamResponse = await this.ragService.questionStream(
        user.id,
        body.question.trim(),
        body.conversationHistory,
        15,
        body.agentMode || 'normal',
        abortController.signal,
        userContext,
      );

      await this.pipeNdjsonStream(res, streamResponse);
    } finally {
      res.off('close', onClose);
      releaseStreamSlot();
    }
  }

  private acquireStreamSlot(userId: string): () => void {
    const active = SearchController.activeStreamsByUser.get(userId) || 0;
    if (active >= SearchController.MAX_STREAMS_PER_USER) {
      throw new HttpException(
        'Too many active streams. Please wait for the current request to finish.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    SearchController.activeStreamsByUser.set(userId, active + 1);

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      const current = SearchController.activeStreamsByUser.get(userId) || 0;
      if (current <= 1) {
        SearchController.activeStreamsByUser.delete(userId);
        return;
      }
      SearchController.activeStreamsByUser.set(userId, current - 1);
    };
  }

  private normalizeStreamCitations(input: unknown): RagCitation[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((citation) => {
        const raw = citation as Partial<UpstreamStreamCitation>;
        if (
          typeof raw.chunk_id !== 'string' ||
          typeof raw.document_id !== 'string' ||
          typeof raw.snippet !== 'string' ||
          typeof raw.score !== 'number' ||
          typeof raw.start_offset !== 'number' ||
          typeof raw.end_offset !== 'number'
        ) {
          return null;
        }
        return {
          chunkId: raw.chunk_id,
          documentId: raw.document_id,
          snippet: raw.snippet,
          score: raw.score,
          startOffset: raw.start_offset,
          endOffset: raw.end_offset,
        } satisfies RagCitation;
      })
      .filter((citation): citation is RagCitation => citation !== null);
  }

  private writeNdjson(res: Response, payload: object): void {
    res.write(`${JSON.stringify(payload)}\n`);
  }

  private parseUpstreamPayload(rawLine: string): UpstreamPayload | null {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return JSON.parse(trimmed) as UpstreamPayload;
    } catch {
      return null;
    }
  }

  private async pipeChatNdjsonStream(
    res: Response,
    streamResponse: globalThis.Response | null,
    userId: string,
    message: string,
    context: ChatContext,
    searchLimit: {
      remainingSearches: number;
      bonusSearches: number;
      resetsAt: Date;
    },
  ): Promise<void> {
    if (!streamResponse) {
      throw new BadRequestException('Unable to start stream');
    }

    if (!streamResponse.ok || !streamResponse.body) {
      const detail = await streamResponse.text();
      throw new BadRequestException(
        `Stream request failed (${streamResponse.status}): ${detail || 'unknown error'}`,
      );
    }

    res.status(streamResponse.status);
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const reader = streamResponse.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalized = false;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        if (!value) {
          continue;
        }

        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          const payload = this.parseUpstreamPayload(line);
          if (!payload) {
            newlineIndex = buffer.indexOf('\n');
            continue;
          }

          if (
            payload.type === 'event' ||
            payload.type === 'error' ||
            payload.type === 'answer_delta'
          ) {
            this.writeNdjson(res, payload);
            newlineIndex = buffer.indexOf('\n');
            continue;
          }

          const citations = this.normalizeStreamCitations(payload.citations);
          const { response, updatedContext } =
            await this.chatSearchService.hydrateChatResponse(
              userId,
              message,
              context,
              {
                answer: payload.answer || '',
                citations,
              },
            );

          this.writeNdjson(res, {
            type: 'result',
            response,
            context: updatedContext,
            searchLimitInfo: {
              remainingSearches: searchLimit.remainingSearches,
              bonusSearches: searchLimit.bonusSearches,
              resetsAt: searchLimit.resetsAt,
            },
            confidence: payload.confidence || 'low',
            processingTimeMs: payload.processing_time_ms || 0,
          });
          finalized = true;
          newlineIndex = buffer.indexOf('\n');
        }
      }

      const tail = decoder.decode();
      if (tail) {
        buffer += tail;
      }
      if (buffer.trim()) {
        const payload = this.parseUpstreamPayload(buffer);
        if (payload?.type === 'answer_delta') {
          this.writeNdjson(res, payload);
        } else if (payload?.type === 'result') {
          const citations = this.normalizeStreamCitations(payload.citations);
          const { response, updatedContext } =
            await this.chatSearchService.hydrateChatResponse(
              userId,
              message,
              context,
              {
                answer: payload.answer || '',
                citations,
              },
            );
          this.writeNdjson(res, {
            type: 'result',
            response,
            context: updatedContext,
            searchLimitInfo: {
              remainingSearches: searchLimit.remainingSearches,
              bonusSearches: searchLimit.bonusSearches,
              resetsAt: searchLimit.resetsAt,
            },
            confidence: payload.confidence || 'low',
            processingTimeMs: payload.processing_time_ms || 0,
          });
          finalized = true;
        }
      }

      if (!finalized) {
        this.writeNdjson(res, {
          type: 'error',
          message: 'Stream completed without a final result.',
        });
      }
    } catch (error) {
      if (!res.writableEnded) {
        this.writeNdjson(res, {
          type: 'error',
          message:
            error instanceof Error ? error.message : 'Unexpected stream error.',
        });
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  private async pipeNdjsonStream(
    res: Response,
    streamResponse: globalThis.Response | null,
  ): Promise<void> {
    if (!streamResponse) {
      throw new BadRequestException('Unable to start stream');
    }

    if (!streamResponse.ok || !streamResponse.body) {
      const detail = await streamResponse.text();
      throw new BadRequestException(
        `Stream request failed (${streamResponse.status}): ${detail || 'unknown error'}`,
      );
    }

    res.status(streamResponse.status);
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const nodeReadable = Readable.fromWeb(streamResponse.body as any);
    await new Promise<void>((resolve, reject) => {
      nodeReadable.on('error', reject);
      nodeReadable.on('end', resolve);
      nodeReadable.pipe(res);
    });
  }
}
