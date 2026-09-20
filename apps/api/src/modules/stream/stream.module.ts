import { Module } from '@nestjs/common';
import { ExecutionsModule } from '../executions/executions.module';
import { ExecutionStreamController } from './api/execution-stream.controller';
import { ExecutionObserverService } from './application/execution-observer.service';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';

@Module({
  imports: [ExecutionsModule],
  controllers: [StreamController, ExecutionStreamController],
  providers: [StreamService, ExecutionObserverService],
})
export class StreamModule {}
