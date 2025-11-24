/**
 * Document interface
 */
export interface Document {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  path: string;
  thumbnailPath?: string;
  title?: string;
  description?: string;
  content?: string;
  isProcessed: boolean;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

/**
 * Document creation input type
 */
export type CreateDocumentInput = Omit<
  Document,
  "id" | "createdAt" | "updatedAt" | "isProcessed"
>;

/**
 * Document update input type
 */
export type UpdateDocumentInput = Partial<
  Omit<Document, "id" | "userId" | "createdAt" | "updatedAt">
>;
