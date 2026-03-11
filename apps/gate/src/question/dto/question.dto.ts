import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

const agentModes = ['normal', 'reasoning'] as const;

export class QuestionConversationMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'], example: 'user' })
  @IsString()
  role: 'user' | 'assistant';

  @ApiProperty({ example: 'Summarize my most recent insurance contract.' })
  @IsString()
  content: string;
}

export class AskQuestionDto {
  @ApiProperty({
    description: 'Question text',
    example: 'What contracts did I sign?',
  })
  @IsString()
  @IsNotEmpty()
  question: string;

  @ApiPropertyOptional({
    description: 'Previous question/answer context',
    type: [QuestionConversationMessageDto],
  })
  @IsOptional()
  @IsArray()
  conversationHistory?: QuestionConversationMessageDto[];

  @ApiPropertyOptional({
    description: 'Agent execution mode',
    enum: agentModes,
    example: 'normal',
  })
  @IsOptional()
  @IsIn(agentModes)
  agentMode?: (typeof agentModes)[number];
}

export class QuickQuestionDto {
  @ApiProperty({
    description: 'Question text',
    example: 'What is my latest electricity bill amount?',
  })
  @IsString()
  @IsNotEmpty()
  question: string;
}

export class QuestionCitationDto {
  @ApiProperty()
  @IsString()
  chunkId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  documentId: string;

  @ApiProperty()
  @IsString()
  snippet: string;

  @ApiProperty({ type: 'number' })
  score: number;

  @ApiProperty({ type: 'number' })
  startOffset: number;

  @ApiProperty({ type: 'number' })
  endOffset: number;
}

export class QuestionResponseDto {
  @ApiProperty()
  @IsString()
  answer: string;

  @ApiProperty({ type: [QuestionCitationDto] })
  citations: QuestionCitationDto[];

  @ApiProperty({ enum: ['high', 'medium', 'low'] })
  confidence: 'high' | 'medium' | 'low';

  @ApiProperty({ type: 'number' })
  processingTimeMs: number;
}

export class QuickQuestionResponseDto {
  @ApiProperty()
  answer: string;

  @ApiProperty({ enum: ['high', 'medium', 'low'] })
  confidence: string;
}
