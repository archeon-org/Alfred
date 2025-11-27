import api from "./api";
import { Category } from "@archeon-org/types";

export const getCategories = async (
  page = 1,
  limit = 20,
  search?: string,
  hideEmpty?: boolean
): Promise<{ data: Category[]; meta: any }> => {
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("limit", limit.toString());
  if (search) params.append("search", search);
  if (hideEmpty) params.append("hideEmpty", "true");

  const response = await api.get(`/categories?${params.toString()}`);
  return response.data;
};

export const getCategoryById = async (id: string): Promise<Category> => {
  const response = await api.get(`/categories/${id}`);
  return response.data;
};

export const createCategory = async (
  data: Partial<Category>
): Promise<Category> => {
  const response = await api.post("/categories", data);
  return response.data;
};

export const updateCategory = async (
  id: string,
  data: Partial<Category>
): Promise<Category> => {
  const response = await api.patch(`/categories/${id}`, data);
  return response.data;
};

export const deleteCategory = async (id: string): Promise<void> => {
  await api.delete(`/categories/${id}`);
};
