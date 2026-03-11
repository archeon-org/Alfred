import { User } from "./user.types";
import { Document } from "./document.types";

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  order?: number;
  isSystemDefault: boolean;
  userId: string;
  parentId?: string | null;
  parent?: Category | null;
  children?: Category[];
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
