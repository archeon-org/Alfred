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

export interface GenerateEmbeddingJobData {
  documentId: string;
  userId: string;
  key: string;
}
