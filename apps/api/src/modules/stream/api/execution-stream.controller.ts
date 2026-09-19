import { Controller, Get, Headers, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ResourceIdPipe } from '../../../common/validation/resource-id.pipe';
import { RequiresFeature } from '../../feature-flags/requires-feature.decorator';
import { ExecutionObserverService } from '../application/execution-observer.service';

@ApiTags('executions')
@ApiBearerAuth('bearerAuth')
@RequiresFeature('agentRuntime')
@Controller('executions')
export class ExecutionStreamController {
  constructor(private readonly observers: ExecutionObserverService) {}
  @Get(':id/events')
  @ApiProduces('text/event-stream')
  observe(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', new ResourceIdPipe('execution')) id: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('last-event-id') cursor: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    return this.observers.observe(principal, id, authorization, cursor, response);
  }
}
