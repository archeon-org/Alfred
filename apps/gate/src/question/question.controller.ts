import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  BadRequestException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Readable } from 'stream';
import { UserEntity } from '@archeon-org/database';
import { buildRagUserContext } from '../common/rag-user-context';
import { QuestionService } from './question.service';
import {
  ApiAskQuestionDocs,
  ApiQuestionControllerDocs,
  ApiQuickQuestionDocs,
} from './question.docs';
import {
  AskQuestionDto,
  QuickQuestionDto,
  QuickQuestionResponseDto,
  QuestionResponseDto,
} from './dto/question.dto';

@ApiQuestionControllerDocs()
@Controller('question')
export class QuestionController {
  private static readonly MAX_STREAMS_PER_USER = 3;
  private static readonly activeStreamsByUser = new Map<string, number>();

  constructor(private readonly questionService: QuestionService) {}

  @Post()
  @ApiAskQuestionDocs()
  async askQuestion(
    @Req() req: Request,
    @Body() body: AskQuestionDto,
  ): Promise<QuestionResponseDto> {
    const user = req.user as UserEntity;
    const userContext = buildRagUserContext(user, req);

    if (!this.questionService.isEnabled()) {
      throw new ServiceUnavailableException(
        'Question API is not configured. Please contact support.',
      );
    }

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

    try {
      const result = await this.questionService.ask(
        user.id,
        body.question.trim(),
        {
          conversationHistory: body.conversationHistory,
          agentMode: body.agentMode,
          userContext,
        },
      );

      return {
        answer: result.answer,
        citations: result.citations,
        confidence: result.confidence,
        processingTimeMs: result.processingTimeMs,
      };
    } catch {
      throw new ServiceUnavailableException(
        'Failed to process your question. Please try again later.',
      );
    }
  }

  @Post('quick')
  @ApiQuickQuestionDocs()
  async quickQuestion(
    @Req() req: Request,
    @Body() body: QuickQuestionDto,
  ): Promise<QuickQuestionResponseDto> {
    const user = req.user as UserEntity;
    const userContext = buildRagUserContext(user, req);

    if (!this.questionService.isEnabled()) {
      throw new ServiceUnavailableException('Question API is not configured');
    }

    if (!body.question || body.question.trim().length < 3) {
      throw new BadRequestException('Question must be at least 3 characters');
    }

    return this.questionService.quickAnswer(
      user.id,
      body.question.trim(),
      userContext,
    );
  }

  @Post('stream')
  async streamQuestion(
    @Req() req: Request,
    @Body() body: AskQuestionDto,
    @Res() res: Response,
  ): Promise<void> {
    const user = req.user as UserEntity;
    const userContext = buildRagUserContext(user, req);

    if (!this.questionService.isEnabled()) {
      throw new ServiceUnavailableException('Question API is not configured');
    }

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

    const releaseStreamSlot = this.acquireStreamSlot(user.id);
    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    res.on('close', onClose);

    try {
      const streamResponse = await this.questionService.stream(
        user.id,
        body.question.trim(),
        {
          conversationHistory: body.conversationHistory,
          agentMode: body.agentMode,
          userContext,
        },
        abortController.signal,
      );

      if (!streamResponse) {
        throw new ServiceUnavailableException(
          'Unable to start question stream',
        );
      }

      if (!streamResponse.ok || !streamResponse.body) {
        const detail = await streamResponse.text();
        throw new ServiceUnavailableException(
          `Question stream failed (${streamResponse.status}): ${detail || 'unknown error'}`,
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
    } finally {
      res.off('close', onClose);
      releaseStreamSlot();
    }
  }

  private acquireStreamSlot(userId: string): () => void {
    const active = QuestionController.activeStreamsByUser.get(userId) || 0;
    if (active >= QuestionController.MAX_STREAMS_PER_USER) {
      throw new HttpException(
        'Too many active streams. Please wait for the current request to finish.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    QuestionController.activeStreamsByUser.set(userId, active + 1);

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      const current = QuestionController.activeStreamsByUser.get(userId) || 0;
      if (current <= 1) {
        QuestionController.activeStreamsByUser.delete(userId);
        return;
      }
      QuestionController.activeStreamsByUser.set(userId, current - 1);
    };
  }
}
