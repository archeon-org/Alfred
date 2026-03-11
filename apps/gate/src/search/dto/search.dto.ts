import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import type { ChatContext } from '../chat-search.service';

const searchModes = ['semantic', 'hybrid', 'keyword'] as const;
const agentModes = ['normal', 'reasoning'] as const;

export class SearchQueryDto {
  @ApiProperty({
    description: 'Search query (minimum 2 characters)',
    example: 'electricity bill from january',
  })
  @IsString()
  @IsNotEmpty()
  q: string;

  @ApiPropertyOptional({
    description: 'Maximum number of results (1-50)',
    example: 10,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Search mode',
    enum: searchModes,
    example: 'hybrid',
  })
  @IsOptional()
  @IsIn(searchModes)
  mode?: (typeof searchModes)[number];
}

export class SearchConversationMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'], example: 'user' })
  @IsString()
  role: 'user' | 'assistant';

  @ApiProperty({ example: 'Find my contracts from last month' })
  @IsString()
  content: string;
}

export class ChatRequestDto {
  @ApiProperty({
    description: 'User message',
    example: 'Find my electricity bills from last month',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    description: 'Optional chat history',
    type: [SearchConversationMessageDto],
  })
  @IsOptional()
  @IsArray()
  conversationHistory?: SearchConversationMessageDto[];

  @ApiPropertyOptional({
    description: 'Chat context from previous turns',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  context?: ChatContext;

  @ApiPropertyOptional({
    description: 'Agent execution mode',
    enum: agentModes,
    example: 'normal',
  })
  @IsOptional()
  @IsIn(agentModes)
  agentMode?: (typeof agentModes)[number];
}

export class ExcludeDocumentDto {
  @ApiProperty({
    description: 'Document UUID to exclude',
    format: 'uuid',
  })
  @IsUUID()
  documentId: string;

  @ApiProperty({
    description: 'Current chat context',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  context: ChatContext;
}

export class QuestionRequestDto {
  @ApiProperty({
    description: 'Question to answer',
    example: 'What contracts did I sign?',
  })
  @IsString()
  @IsNotEmpty()
  question: string;

  @ApiPropertyOptional({
    description: 'Conversation history',
    type: [SearchConversationMessageDto],
  })
  @IsOptional()
  @IsArray()
  conversationHistory?: SearchConversationMessageDto[];

  @ApiPropertyOptional({
    description: 'Agent execution mode',
    enum: agentModes,
    example: 'reasoning',
  })
  @IsOptional()
  @IsIn(agentModes)
  agentMode?: (typeof agentModes)[number];
}
