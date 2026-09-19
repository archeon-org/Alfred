import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/api-response';
import { RequiresFeature } from '../../feature-flags/requires-feature.decorator';
import { AgentCatalogService } from '../application/agent-catalog.service';

@ApiTags('agents')
@ApiBearerAuth('bearerAuth')
@RequiresFeature('teams')
@Controller('agents')
export class AgentsController {
  constructor(private readonly catalog: AgentCatalogService) {}

  /** The specialists the runtime declares as sub-agents; the runtime still enforces habilitation. */
  @Get() async list() {
    return ok(await this.catalog.list());
  }
}
