export interface ProcessDocumentJobData {
  documentId: string;
  userId: string;
  key: string;
  originalName?: string;
}

export interface GenerateTitleJobData {
  documentId: string;
  userId: string;
  key: string;
  originalName?: string;
}

/**
 * @deprecated Use IngestDocumentGraphJobData instead
 */
export interface GenerateEmbeddingJobData {
  documentId: string;
  userId: string;
  key: string;
}

/**
 * Data for knowledge graph ingestion task.
 * Replaces the old embedding generation workflow.
 */
export interface IngestDocumentGraphJobData {
  documentId: string;
  userId: string;
  documentName: string;
  content: string;
  referenceTime?: string | null;
}
