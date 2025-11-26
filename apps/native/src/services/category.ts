import api from "./api";
import { Category } from "@archeon-org/types";

export const getCategories = async (
  page = 1,
  limit = 20
): Promise<{ data: Category[]; meta: any }> => {
  const response = await api.get(`/categories?page=${page}&limit=${limit}`);
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
