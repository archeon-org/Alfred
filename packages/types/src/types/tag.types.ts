import { User } from "./user.types";
import { Document } from "./document.types";

export interface Tag {
  id: string;
  name: string;
  color: string;
  order?: number;
  isSystemDefault: boolean;
  userId: string;
  user?: User;
  documents?: Document[];
  createdAt: Date;
  updatedAt: Date;
}

export type CreateTagInput = Omit<
  Tag,
  "id" | "createdAt" | "updatedAt" | "user" | "documents"
>;
export type UpdateTagInput = Partial<CreateTagInput>;
