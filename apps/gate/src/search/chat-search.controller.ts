import {
  Controller,
  Post,
  Body,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { UserEntity } from '@archeon-org/database';
import {
  ChatSearchService,
  ChatMessage,
  ChatContext,
} from './chat-search.service';

interface ChatRequestDto {
  message: string;
  conversationHistory?: ChatMessage[];
  context?: ChatContext;
}

interface ChatResponseDto {
  response: ChatMessage;
  context: ChatContext;
}

interface ExcludeDocumentDto {
  documentId: string;
  context: ChatContext;
}

@Controller('search/chat')
export class ChatSearchController {
  constructor(private readonly chatSearchService: ChatSearchService) {}

  /**
   * Send a chat message to search for documents
   * POST /search/chat
   */
  @Post()
  async chat(
    @Req() req: Request,
    @Body() body: ChatRequestDto,
  ): Promise<ChatResponseDto> {
    const user = req.user as UserEntity;

    if (!body.message || body.message.trim().length === 0) {
      throw new BadRequestException('Message is required');
    }

    const conversationHistory = body.conversationHistory || [];
    const context = body.context || this.chatSearchService.createContext();

    const { response, updatedContext } = await this.chatSearchService.chat(
      user.id,
      body.message.trim(),
      conversationHistory,
      context,
    );

    return {
      response,
      context: updatedContext,
    };
  }

  /**
   * Exclude a document from search results
   * POST /search/chat/exclude
   */
  @Post('exclude')
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
}
