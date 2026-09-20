import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/api-response';
import { RequiresFeature } from '../../feature-flags/requires-feature.decorator';
import { AgentCatalogService } from '../application/agent-catalog.service';
import { AgentListQueryDto } from './agent-list-query.dto';
import { DocListAgents } from './agents.openapi';

@ApiTags('agents')
@ApiBearerAuth('bearerAuth')
@RequiresFeature('teams')
@Controller('agents')
export class AgentsController {
  constructor(private readonly catalog: AgentCatalogService) {}

  /**
   * The specialists the runtime declares as sub-agents, searched by name, graph, description or
   * tag and paged by cursor; the runtime still enforces habilitation.
   */
  @Get()
  @DocListAgents()
  async list(@Query() query: AgentListQueryDto) {
    return ok(await this.catalog.list(query));
  }
}
