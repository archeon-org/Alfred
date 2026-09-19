import { Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/api-response';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ResourceIdPipe } from '../../../common/validation/resource-id.pipe';
import { RequiresFeature } from '../../feature-flags/requires-feature.decorator';
import { StreamAuthorityService } from '../../stream/application/stream-authority.service';
import { ExecutionObservationService } from '../application/execution-observation.service';
import { ExecutionsService } from '../application/executions.service';

@ApiTags('executions')
@ApiBearerAuth('bearerAuth')
@RequiresFeature('agentRuntime')
@Controller('executions')
export class ExecutionResourceController {
  constructor(
    private readonly executions: ExecutionsService,
    private readonly observations: ExecutionObservationService,
    private readonly authority: StreamAuthorityService,
  ) {}

  @Get(':id')
  async get(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', new ResourceIdPipe('execution')) id: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.authority.assert(principal, authorization);
    return ok({ snapshot: await this.observations.snapshot(principal, id) });
  }

  @Post(':id/stop')
  @HttpCode(200)
  async stop(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', new ResourceIdPipe('execution')) id: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.authority.assert(principal, authorization);
    await this.executions.stop(principal, id);
    return ok({ snapshot: await this.observations.snapshot(principal, id) });
  }
}
