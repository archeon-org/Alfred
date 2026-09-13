import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ExecutionsController } from './api/executions.controller';
import { ExecutionsService } from './application/executions.service';
import { RUNTIME_CLIENT } from './application/runtime-client.port';
import { LangGraphRuntimeClient } from './infrastructure/langgraph/langgraph-runtime.client';

@Module({
  imports: [TenantsModule, ConversationsModule],
  controllers: [ExecutionsController],
  providers: [ExecutionsService, { provide: RUNTIME_CLIENT, useClass: LangGraphRuntimeClient }],
})
export class ExecutionsModule {}
