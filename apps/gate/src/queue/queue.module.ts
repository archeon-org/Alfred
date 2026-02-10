import { Module } from '@nestjs/common';
import { CeleryModule } from '../celery/celery.module';
import { QueueService } from './queue.service';

@Module({
  imports: [CeleryModule],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
