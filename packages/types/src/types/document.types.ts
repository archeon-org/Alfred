import { Category } from "./category.types";
import { Tag } from "./tag.types";

export enum ProcessingStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

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
  metadata?: Record<string, any>;
  isProcessed: boolean;
  processingStatus: ProcessingStatus;
  classificationSource?: "AI" | "MANUAL";
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  userId: string;
  categoryId?: string;
  category?: Category;
  tags?: Tag[];
  /** Whether the document has a generated embedding for semantic search */
  hasEmbedding?: boolean;
}

/**
 * Document creation input type
 */
export type CreateDocumentInput = Omit<
  Document,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "deletedAt"
  | "isProcessed"
  | "processingStatus"
  | "category"
  | "tags"
>;

/**
 * Document update input type
 */
export type UpdateDocumentInput = Partial<
  Omit<
    Document,
    | "id"
    | "userId"
    | "createdAt"
    | "updatedAt"
    | "deletedAt"
    | "category"
    | "tags"
  >
>;
