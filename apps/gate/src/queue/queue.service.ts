import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  ProcessDocumentJobData,
  GenerateTitleJobData,
  GenerateEmbeddingJobData,
  DeleteEmbeddingJobData,
} from '@archeon-org/types';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('documents') private readonly documentsQueue: Queue,
  ) {}

  async addDocumentProcessingJob(data: ProcessDocumentJobData) {
    try {
      await this.documentsQueue.add('process-document', data, {
        attempts: 1,
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

  async addTitleGenerationJob(data: GenerateTitleJobData) {
    try {
      await this.documentsQueue.add('generate-title', data, {
        attempts: 1,
        removeOnComplete: true,
      });
      this.logger.log(
        `Added title generation job for document ${data.documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add title generation job for document ${data.documentId}`,
        error.stack,
      );
      throw error;
    }
  }

  async addEmbeddingGenerationJob(data: GenerateEmbeddingJobData) {
    try {
      await this.documentsQueue.add('generate-embedding', data, {
        attempts: 1,
        removeOnComplete: true,
      });
      this.logger.log(
        `Added embedding generation job for document ${data.documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add embedding generation job for document ${data.documentId}`,
        error.stack,
      );
      throw error;
    }
  }

  async addDeleteEmbeddingJob(data: DeleteEmbeddingJobData) {
    try {
      await this.documentsQueue.add('delete-embedding', data, {
        attempts: 3, // Retry a few times for cleanup jobs
        removeOnComplete: true,
        removeOnFail: true, // Don't keep failed cleanup jobs
      });
      this.logger.log(
        `Added delete embedding job for document ${data.documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add delete embedding job for document ${data.documentId}`,
        error.stack,
      );
      // Don't throw - embedding deletion is not critical
    }
  }
}
