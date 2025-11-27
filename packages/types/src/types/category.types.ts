import { User } from "./user.types";
import { Document } from "./document.types";

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  isSystemDefault: boolean;
  userId: string;
  user?: User;
  documents?: Document[];
  documentCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateCategoryInput = Omit<
  Category,
  "id" | "createdAt" | "updatedAt" | "user" | "documents" | "documentCount"
>;
export type UpdateCategoryInput = Partial<CreateCategoryInput>;
