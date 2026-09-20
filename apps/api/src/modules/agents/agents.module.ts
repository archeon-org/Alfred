import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentsController } from './api/agents.controller';
import { AGENT_CATALOG } from './application/agent-catalog.port';
import { AgentCatalogService } from './application/agent-catalog.service';
import { LangGraphAgentCatalog } from './infrastructure/langgraph-agent-catalog';

@Module({
  imports: [ConfigModule],
  controllers: [AgentsController],
  providers: [AgentCatalogService, { provide: AGENT_CATALOG, useClass: LangGraphAgentCatalog }],
})
export class AgentsModule {}
