import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ProcessDocumentJobData } from '@archeon-org/types';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('documents') private readonly documentsQueue: Queue,
  ) {}

  async addDocumentProcessingJob(data: ProcessDocumentJobData) {
    try {
      await this.documentsQueue.add('process-document', data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
      });
      this.logger.log(
        `Added document processing job for document ${data.documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add document processing job for document ${data.documentId}`,
        error.stack,
      );
      throw error;
    }
  }
}
