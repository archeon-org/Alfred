import { EXECUTION_SSE_EVENT } from '@alfred/contracts';
import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ok } from '../../../common/api-response';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ResourceIdPipe } from '../../../common/validation/resource-id.pipe';
import { CONVERSATION_RESOURCE } from '../../conversations/domain/conversation';
import { RequiresFeature } from '../../feature-flags/requires-feature.decorator';
import { ExecutionsService } from '../application/executions.service';
import { toExecutionDto } from '../domain/execution';
import { SseWriter } from './sse-writer';
import { StartExecutionDto } from './dto/start-execution.dto';

const conversationId = new ResourceIdPipe(CONVERSATION_RESOURCE);

/** Chat bridge: the browser talks to the API only; the runtime stays private (ALF-DEC-003). */
@ApiTags('executions')
@ApiBearerAuth('bearerAuth')
@RequiresFeature('agentRuntime')
@Controller('conversations/:id')
export class ExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Get('messages')
  async listMessages(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', conversationId) id: string,
  ) {
    return ok({ items: await this.executions.listMessages(principal, id) });
  }

  /**
   * Starts one execution and answers with the live SSE stream of native runtime events. Ownership
   * and validation errors are raised before any header is sent, so they stay JSON envelopes.
   */
  @Post('executions')
  @HttpCode(200)
  @ApiProduces('text/event-stream')
  async start(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', conversationId) id: string,
    @Body() body: StartExecutionDto,
    @Res() response: Response,
  ): Promise<void> {
    const started = await this.executions.start(principal, id, body.message);
    const abort = new AbortController();
    response.on('close', () => abort.abort());
    const writer = new SseWriter(response);
    writer.open();
    writer.write(EXECUTION_SSE_EVENT, toExecutionDto(started.execution));
    try {
      for await (const event of this.executions.stream(started, abort.signal)) {
        writer.write(event.event, event.data);
      }
    } finally {
      writer.close();
    }
  }
}
