import { Injectable, Inject, Logger } from '@nestjs/common';
import { Client } from 'celery-node';
import {
  ProcessDocumentJobData,
  GenerateTitleJobData,
  IngestDocumentGraphJobData,
} from '@archeon-org/types';
import { CELERY_CLIENT } from '../celery/celery.module';

const TASKS = {
  PROCESS_DOCUMENT: 'scribe.tasks.document.process_document',
  GENERATE_TITLE: 'scribe.tasks.document.generate_title',
  INGEST_DOCUMENT_GRAPH: 'scribe.tasks.graphiti.ingest_document_to_graph',
  DELETE_DOCUMENT_FROM_GRAPH:
    'scribe.tasks.graphiti.delete_document_from_graph',
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

  async addGraphIngestionJob(data: IngestDocumentGraphJobData): Promise<void> {
    try {
      const task = this.celeryClient.createTask(TASKS.INGEST_DOCUMENT_GRAPH);

      await task.applyAsync([data]);

      this.logger.log(
        `Added knowledge graph ingestion task for document ${data.documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add graph ingestion task for document ${data.documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async addGraphDeletionJob(data: {
    documentId: string;
    userId: string;
  }): Promise<void> {
    try {
      const task = this.celeryClient.createTask(
        TASKS.DELETE_DOCUMENT_FROM_GRAPH,
      );

      await task.applyAsync([data]);

      this.logger.log(
        `Added knowledge graph deletion task for document ${data.documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add graph deletion task for document ${data.documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
