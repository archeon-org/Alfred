import { EXECUTION_JSON_PROFILE } from '@alfred/contracts';
import { Body, Controller, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/api-response';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiException } from '../../../common/errors/api.exception';
import { ResourceIdPipe } from '../../../common/validation/resource-id.pipe';
import { CONVERSATION_RESOURCE } from '../../conversations/domain/conversation';
import { RequiresFeature } from '../../feature-flags/requires-feature.decorator';
import { ExecutionsService } from '../application/executions.service';
import { ExecutionObservationService } from '../application/execution-observation.service';
import { ExecutionSessionGuard } from './execution-session.guard';
import { DocGetActiveExecution, DocListMessages, DocStartExecution } from './executions.openapi';
import { StartExecutionDto } from './dto/start-execution.dto';

const conversationId = new ResourceIdPipe(CONVERSATION_RESOURCE);

@ApiTags('executions')
@ApiBearerAuth('bearerAuth')
@RequiresFeature('agentRuntime')
@UseGuards(ExecutionSessionGuard)
@Controller('conversations/:id')
export class ExecutionsController {
  constructor(
    private readonly executions: ExecutionsService,
    private readonly observations: ExecutionObservationService,
  ) {}

  @Get('messages')
  @DocListMessages()
  async listMessages(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', conversationId) id: string,
  ) {
    return ok({ items: await this.executions.listMessages(principal, id) });
  }

  @Get('executions/active')
  @DocGetActiveExecution()
  async active(@CurrentUser() principal: AuthPrincipal, @Param('id', conversationId) id: string) {
    const execution = await this.executions.active(principal, id);
    return ok({
      snapshot:
        execution === null ? null : await this.observations.snapshot(principal, execution.id),
    });
  }

  /** Persist the command before any runtime side effect; observation has a separate lifetime. */
  @Post('executions')
  @HttpCode(200)
  @ApiProduces(EXECUTION_JSON_PROFILE)
  @DocStartExecution()
  async start(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', conversationId) id: string,
    @Body() body: StartExecutionDto,
    @Headers('accept') accept: string | undefined,
  ) {
    if (accept !== EXECUTION_JSON_PROFILE && accept !== 'application/json') {
      throw new ApiException(
        406,
        'execution_profile_unsupported',
        'Select a supported execution response format.',
      );
    }
    const started = await this.executions.start(principal, id, body.message, {
      submissionId: body.submissionId,
      profile: 'snapshot-v1',
      attachmentIds: body.attachmentIds,
    });
    return ok({ snapshot: await this.observations.snapshot(principal, started.execution.id) });
  }
}
