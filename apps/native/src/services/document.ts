import api from "./api";
import { Document } from "@archeon-org/types";

export const uploadDocument = async (uri: string): Promise<Document> => {
  const formData = new FormData();
  const filename = uri.split("/").pop() || "document.pdf";

  // Ensure we are sending a PDF
  const type = "application/pdf";

  formData.append("file", {
    uri,
    name: filename,
    type,
  } as any);

  const response = await api.post("/documents/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const getDocuments = async (): Promise<Document[]> => {
  const response = await api.get("/documents");
  return response.data;
};

export const getDocumentUrl = async (
  id: string
): Promise<{ document: Document; url: string }> => {
  const response = await api.get(`/documents/${id}`);
  return response.data;
};
