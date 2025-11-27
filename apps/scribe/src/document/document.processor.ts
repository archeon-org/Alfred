import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DocumentService } from './document.service';
import {
  ProcessDocumentJobData,
  GenerateTitleJobData,
} from '@archeon-org/types';

@Processor('documents')
export class DocumentProcessor {
  private readonly logger = new Logger(DocumentProcessor.name);

  constructor(private readonly documentService: DocumentService) {}

  @Process('process-document')
  async handleProcessDocument(job: Job<ProcessDocumentJobData>) {
    this.logger.log(
      `Received job ${job.id} to process document ${job.data.documentId}`,
    );

    try {
      await this.documentService.processDocument(job.data);
      this.logger.log(
        `Successfully completed job ${job.id} for document ${job.data.documentId}`,
      );
    } catch (error) {
      // Log the error but don't re-throw it
      // The DocumentService already handles failure (updates status, sends notification)
      // Re-throwing would cause BullMQ to retry the job
      this.logger.error(
        `Job ${job.id} failed for document ${job.data.documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  @Process('generate-title')
  async handleGenerateTitle(job: Job<GenerateTitleJobData>) {
    this.logger.log(
      `Received job ${job.id} to generate title for document ${job.data.documentId}`,
    );

    try {
      await this.documentService.generateDocumentTitle(job.data);
      this.logger.log(
        `Successfully completed title generation job ${job.id} for document ${job.data.documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Title generation job ${job.id} failed for document ${job.data.documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
