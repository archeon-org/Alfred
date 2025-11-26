import api from "./api";
import { Document } from "@archeon-org/types";

export const uploadDocument = async (
  uri: string,
  classificationSource: "AI" | "MANUAL" = "AI"
): Promise<Document> => {
  const formData = new FormData();
  const filename = uri.split("/").pop() || "document.pdf";

  // Ensure we are sending a PDF
  const type = "application/pdf";

  formData.append("file", {
    uri,
    name: filename,
    type,
  } as any);

  formData.append("classificationSource", classificationSource);

  const response = await api.post("/documents/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const getDocuments = async (
  page = 1,
  limit = 20,
  categoryId?: string,
  search?: string,
  processingStatus?: string,
  classificationSource?: string
): Promise<{ data: Document[]; meta: any }> => {
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("limit", limit.toString());

  if (categoryId) {
    params.append("filter.categoryId", `$eq:${categoryId}`);
  }
  if (search) {
    params.append("search", search);
  }
  if (processingStatus) {
    params.append("filter.processingStatus", `$eq:${processingStatus}`);
  }
  if (classificationSource) {
    params.append("filter.classificationSource", `$eq:${classificationSource}`);
  }

  const response = await api.get(`/documents?${params.toString()}`);
  return response.data;
};

export const getRecentDocuments = async (limit = 5): Promise<Document[]> => {
  const response = await getDocuments(1, limit);
  return response.data;
};

export const getPendingManualDocuments = async (
  limit = 3
): Promise<{ data: Document[]; meta: any }> => {
  return getDocuments(1, limit, undefined, undefined, "PENDING", "MANUAL");
};

export const getDocumentUrl = async (
  id: string
): Promise<{ document: Document; url: string }> => {
  const response = await api.get(`/documents/${id}`);
  return response.data;
};

export const updateDocument = async (
  id: string,
  data: Partial<Document>
): Promise<Document> => {
  const response = await api.patch(`/documents/${id}`, data);
  return response.data;
};

export const bulkUpdateDocuments = async (
  documentIds: string[],
  categoryId: string
): Promise<void> => {
  await api.patch("/documents/bulk-update", { documentIds, categoryId });
};

export const triggerAiClassification = async (
  id: string
): Promise<Document> => {
  const response = await api.post(`/documents/${id}/classify`);
  return response.data;
};
