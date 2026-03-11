export interface TemplateCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  parentTemplateCategoryId?: string | null;
  level?: number;
  parentCategory?: TemplateCategory | null;
  childCategories?: TemplateCategory[];
  templateId?: string;
  template?: Template;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateTag {
  id: string;
  name: string;
  color: string;
  order: number;
  templateId?: string;
  template?: Template;
  createdAt: Date;
  updatedAt: Date;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  order: number;
  categories: TemplateCategory[];
  tags: TemplateTag[];
  createdAt: Date;
  updatedAt: Date;
}

export type CreateTemplateInput = Omit<
  Template,
  "id" | "createdAt" | "updatedAt" | "categories" | "tags"
>;
export type UpdateTemplateInput = Partial<CreateTemplateInput>;
