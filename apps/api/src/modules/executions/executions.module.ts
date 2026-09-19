import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { TenantsModule } from '../tenants/tenants.module';
import { StreamAuthorityService } from '../stream/application/stream-authority.service';
import { ExecutionSessionGuard } from './api/execution-session.guard';
import { ExecutionsController } from './api/executions.controller';
import { ExecutionResourceController } from './api/execution-resource.controller';
import { ExecutionsService } from './application/executions.service';
import { ExecutionObservationService } from './application/execution-observation.service';
import { ExecutionProcessor } from './application/execution-processor';
import { ExecutionRecoveryWorker } from './application/execution-recovery.worker';
import { ExecutionStreamConsumer } from './application/execution-stream.consumer';
import { RUNTIME_CLIENT } from './application/runtime-client.port';
import { LangGraphRuntimeClient } from './infrastructure/langgraph/langgraph-runtime.client';
import { ExecutionLeaseStore } from './infrastructure/persistence/execution-lease.store';
import { ExecutionStateStore } from './infrastructure/persistence/execution-state.store';

@Module({
  imports: [TenantsModule, ConversationsModule],
  controllers: [ExecutionsController, ExecutionResourceController],
  providers: [
    ExecutionSessionGuard,
    ExecutionsService,
    ExecutionObservationService,
    StreamAuthorityService,
    ExecutionLeaseStore,
    ExecutionStateStore,
    ExecutionStreamConsumer,
    ExecutionProcessor,
    ExecutionRecoveryWorker,
    { provide: RUNTIME_CLIENT, useClass: LangGraphRuntimeClient },
  ],
  exports: [ExecutionsService, ExecutionObservationService, StreamAuthorityService, RUNTIME_CLIENT],
})
export class ExecutionsModule {}
