import { Process, Processor, OnQueueStalled } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DocumentService } from './document.service';
import {
  ProcessDocumentJobData,
  GenerateTitleJobData,
  GenerateEmbeddingJobData,
} from '@archeon-org/types';
import { activeJobsInThisWorker } from '../main';

// Limit concurrency to 1 job at a time per worker
// This prevents memory exhaustion from multiple OCR processes running simultaneously
@Processor('documents', { concurrency: 1 })
export class DocumentProcessor {
  private readonly logger = new Logger(DocumentProcessor.name);

  constructor(private readonly documentService: DocumentService) {}

  /**
   * Called when a job is detected as stalled (worker died mid-processing)
   */
  @OnQueueStalled()
  onStalled(job: Job) {
    this.logger.warn(
      `⚠️ Job ${job.id} was stalled and will be retried. ` +
        `Document: ${job.data?.documentId || 'unknown'}, ` +
        `Attempt: ${job.attemptsMade + 1}/${job.opts?.attempts || 1}`,
    );
    // Remove from our tracking if it was ours
    activeJobsInThisWorker.delete(String(job.id));
  }

  @Process('process-document')
  async handleProcessDocument(job: Job<ProcessDocumentJobData>) {
    const jobId = String(job.id);
    activeJobsInThisWorker.add(jobId);

    const isRetry = job.attemptsMade > 0;
    this.logger.log(
      `Received job ${job.id} to process document ${job.data.documentId}` +
        (isRetry ? ` (RETRY attempt ${job.attemptsMade + 1})` : '') +
        ` [Active in this worker: ${activeJobsInThisWorker.size}]`,
    );

    try {
      await this.documentService.processDocument(job.data, isRetry);
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
    } finally {
      activeJobsInThisWorker.delete(jobId);
      this.logger.debug(
        `Job ${job.id} removed from active tracking [Active: ${activeJobsInThisWorker.size}]`,
      );
    }
  }

  @Process('generate-title')
  async handleGenerateTitle(job: Job<GenerateTitleJobData>) {
    const jobId = String(job.id);
    activeJobsInThisWorker.add(jobId);

    this.logger.log(
      `Received job ${job.id} to generate title for document ${job.data.documentId}` +
        ` [Active in this worker: ${activeJobsInThisWorker.size}]`,
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
    } finally {
      activeJobsInThisWorker.delete(jobId);
    }
  }

  @Process('generate-embedding')
  async handleGenerateEmbedding(job: Job<GenerateEmbeddingJobData>) {
    const jobId = String(job.id);
    activeJobsInThisWorker.add(jobId);

    this.logger.log(
      `Received job ${job.id} to generate embedding for document ${job.data.documentId}` +
        ` [Active in this worker: ${activeJobsInThisWorker.size}]`,
    );

    try {
      await this.documentService.generateDocumentEmbedding(job.data);
      this.logger.log(
        `Successfully completed embedding generation job ${job.id} for document ${job.data.documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Embedding generation job ${job.id} failed for document ${job.data.documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      activeJobsInThisWorker.delete(jobId);
    }
  }
}
