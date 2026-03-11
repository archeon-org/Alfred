import { Injectable, Inject, Logger } from '@nestjs/common';
import { Client } from 'celery-node';
import {
  ProcessDocumentJobData,
  ProcessDocumentsBulkJobData,
  GenerateTitleJobData,
  IndexDocumentJobData,
  DeleteDocumentIndexJobData,
  BackfillDocumentsJobData,
} from '@archeon-org/types';
import { CELERY_CLIENT } from '../celery/celery.module';

const TASKS = {
  PROCESS_DOCUMENT: 'scribe.tasks.document.process_document',
  PROCESS_DOCUMENTS_BULK: 'scribe.tasks.document.process_documents_bulk',
  GENERATE_TITLE: 'scribe.tasks.document.generate_title',
  INDEX_DOCUMENT: 'scribe.tasks.rag.index_document',
  DELETE_DOCUMENT_INDEX: 'scribe.tasks.rag.delete_document_index',
  BACKFILL_DOCUMENTS: 'scribe.tasks.rag.backfill_documents',
} as const;

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @Inject(CELERY_CLIENT)
    private readonly celeryClient: Client,
  ) {}

  async addDocumentProcessingJob(data: ProcessDocumentJobData): Promise<void> {
    try {
      const task = this.celeryClient.createTask(TASKS.PROCESS_DOCUMENT);

      await task.applyAsync([data]);

      this.logger.log(
        `Added document processing task for document ${data.documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add document processing task for document ${data.documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async addBulkDocumentProcessingJob(
    data: ProcessDocumentsBulkJobData,
  ): Promise<void> {
    try {
      const task = this.celeryClient.createTask(TASKS.PROCESS_DOCUMENTS_BULK);
      await task.applyAsync([data]);

      this.logger.log(
        `Added bulk document processing task for user ${data.userId} (${data.documents.length} documents)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add bulk document processing task for user ${data.userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async addTitleGenerationJob(data: GenerateTitleJobData): Promise<void> {
    try {
      const task = this.celeryClient.createTask(TASKS.GENERATE_TITLE);

      await task.applyAsync([data]);

      this.logger.log(
        `Added title generation task for document ${data.documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add title generation task for document ${data.documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async addDocumentIndexingJob(data: IndexDocumentJobData): Promise<void> {
    try {
      const task = this.celeryClient.createTask(TASKS.INDEX_DOCUMENT);

      await task.applyAsync([data]);

      this.logger.log(
        `Added document indexing task for document ${data.documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add document indexing task for document ${data.documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async addDocumentIndexDeletionJob(
    data: DeleteDocumentIndexJobData,
  ): Promise<void> {
    try {
      const task = this.celeryClient.createTask(TASKS.DELETE_DOCUMENT_INDEX);

      await task.applyAsync([data]);

      this.logger.log(
        `Added document index deletion task for document ${data.documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add document index deletion task for document ${data.documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async addBackfillDocumentsJob(data: BackfillDocumentsJobData): Promise<void> {
    try {
      const task = this.celeryClient.createTask(TASKS.BACKFILL_DOCUMENTS);
      await task.applyAsync([data]);
      this.logger.log(
        `Added document backfill task (requestedBy=${data.requestedBy || 'system'})`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to add document backfill task',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
