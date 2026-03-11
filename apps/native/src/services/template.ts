import api from "./api";
import { Template, Category } from "@archeon-org/types";

export const getTemplates = async (
  page = 1,
  limit = 10,
  search = "",
): Promise<{ data: Template[]; meta: any }> => {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  if (search) {
    params.append("search", search);
  }
  const response = await api.get(`/templates?${params.toString()}`);
  return response.data;
};

export const applyTemplate = async (templateId: string): Promise<void> => {
  await api.post(`/templates/${templateId}/apply`);
};

export const getTemplateCategories = async (
  templateId: string,
  page = 1,
  limit = 20,
): Promise<{ data: Category[]; meta: any }> => {
  const response = await api.get(
    `/templates/${templateId}/categories?page=${page}&limit=${limit}`,
  );
  return response.data;
};
