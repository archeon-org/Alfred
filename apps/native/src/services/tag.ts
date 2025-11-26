import api from "./api";
import { Tag } from "@archeon-org/types";

export const getTags = async (): Promise<Tag[]> => {
  const response = await api.get("/tags");
  return response.data;
};

export const createTag = async (name: string, color?: string): Promise<Tag> => {
  const response = await api.post("/tags", { name, color });
  return response.data;
};
