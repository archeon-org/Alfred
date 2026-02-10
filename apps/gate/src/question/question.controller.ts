import {
  Controller,
  Post,
  Body,
  Req,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Request } from 'express';
import { UserEntity } from '@archeon-org/database';
import { QuestionService } from './question.service';

interface AskQuestionDto {
  question: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface QuestionResponseDto {
  answer: string;
  sources: string[];
  confidence: 'high' | 'medium' | 'low';
  processingTimeMs: number;
}

@Controller('question')
export class QuestionController {
  constructor(private readonly questionService: QuestionService) {}

  @Post()
  async askQuestion(
    @Req() req: Request,
    @Body() body: AskQuestionDto,
  ): Promise<QuestionResponseDto> {
    const user = req.user as UserEntity;

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
        },
      );

      return {
        answer: result.answer,
        sources: result.sources,
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
  async quickQuestion(
    @Req() req: Request,
    @Body() body: { question: string },
  ): Promise<{ answer: string; confidence: string }> {
    const user = req.user as UserEntity;

    if (!this.questionService.isEnabled()) {
      throw new ServiceUnavailableException('Question API is not configured');
    }

    if (!body.question || body.question.trim().length < 3) {
      throw new BadRequestException('Question must be at least 3 characters');
    }

    return this.questionService.quickAnswer(user.id, body.question.trim());
  }
}
