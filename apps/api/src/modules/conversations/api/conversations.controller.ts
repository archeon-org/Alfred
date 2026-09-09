import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/api-response';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { ResourceIdPipe } from '../../../common/validation/resource-id.pipe';
import { ConversationsService } from '../application/conversations.service';
import { CONVERSATION_RESOURCE } from '../domain/conversation';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';

import { UpdateConversationDto } from './dto/update-conversation.dto';

const conversationId = new ResourceIdPipe(CONVERSATION_RESOURCE);

@ApiTags('conversations')
@ApiBearerAuth('bearerAuth')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  @HttpCode(201)
  @Idempotent()
  async create(@CurrentUser() principal: AuthPrincipal, @Body() body: CreateConversationDto) {
    return ok(await this.conversations.create(principal, body));
  }

  @Get()
  async list(@CurrentUser() principal: AuthPrincipal, @Query() query: ListConversationsQueryDto) {
    return ok(await this.conversations.list(principal, query));
  }

  @Get(':id')
  async get(@CurrentUser() principal: AuthPrincipal, @Param('id', conversationId) id: string) {
    return ok(await this.conversations.get(principal, id));
  }

  @Patch(':id')
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', conversationId) id: string,
    @Body() body: UpdateConversationDto,
  ) {
    return ok(await this.conversations.update(principal, id, body));
  }

  @Post(':id/pin')
  @HttpCode(200)
  async pin(@CurrentUser() principal: AuthPrincipal, @Param('id', conversationId) id: string) {
    return ok(await this.conversations.setPinned(principal, id, true));
  }

  @Post(':id/unpin')
  @HttpCode(200)
  async unpin(@CurrentUser() principal: AuthPrincipal, @Param('id', conversationId) id: string) {
    return ok(await this.conversations.setPinned(principal, id, false));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', conversationId) id: string,
  ): Promise<void> {
    await this.conversations.remove(principal, id);
  }
}
