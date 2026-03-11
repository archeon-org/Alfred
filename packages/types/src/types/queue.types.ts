export interface ProcessDocumentJobData {
  documentId: string;
  userId: string;
  key: string;
  originalName?: string;
}

export interface ProcessDocumentsBulkJobData {
  userId: string;
  documents: ProcessDocumentJobData[];
  bulkOperationId?: string;
  notifySummary?: boolean;
  suppressPerDocumentNotifications?: boolean;
}

export interface GenerateTitleJobData {
  documentId: string;
  userId: string;
  key: string;
  originalName?: string;
}

export interface IndexDocumentJobData {
  documentId: string;
  userId: string;
  manualTrigger?: boolean;
  bulkOperationId?: string;
  suppressNotifications?: boolean;
}

export interface DeleteDocumentIndexJobData {
  documentId: string;
  userId: string;
}

export interface BackfillDocumentsJobData {
  requestedBy?: string;
  batchSize?: number;
}
