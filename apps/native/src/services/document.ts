import api from "./api";
import { Document } from "@archeon-org/types";
import { parseApiError } from "../utils/apiError";

export interface BulkUploadInput {
  uri: string;
  originalFilename?: string;
  mimeType?: string;
}

export interface BulkUploadFailure {
  uri: string;
  originalFilename?: string;
  message: string;
  statusCode?: number;
}

export interface BulkUploadResult {
  total: number;
  succeeded: Document[];
  failed: BulkUploadFailure[];
}

interface GateBulkUploadFailure {
  originalName: string;
  message: string;
  code: "UPLOAD_FAILED" | "QUEUE_FAILED";
}

interface GateBulkUploadResponse {
  total: number;
  succeeded: number;
  failed: number;
  classificationSource: "AI" | "MANUAL";
  documents: Document[];
  failures: GateBulkUploadFailure[];
}

const inferMimeType = (filename: string): string => {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "application/pdf";
};

export const uploadDocument = async (
  uri: string,
  classificationSource: "AI" | "MANUAL" = "AI",
  originalFilename?: string,
  mimeType?: string,
): Promise<Document> => {
  const formData = new FormData();
  // Use provided filename or extract from URI as fallback
  const filename = originalFilename || uri.split("/").pop() || "document.pdf";

  const type = mimeType || inferMimeType(filename);

  formData.append("file", {
    uri,
    name: filename,
    type,
  } as any);

  const endpoint =
    classificationSource === "AI"
      ? "/documents/upload/ai"
      : "/documents/upload/manual";

  const response = await api.post(endpoint, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const uploadDocumentsBulk = async (
  inputs: BulkUploadInput[],
  classificationSource: "AI" | "MANUAL" = "AI",
  concurrency = 3,
): Promise<BulkUploadResult> => {
  if (inputs.length === 0) {
    return { total: 0, succeeded: [], failed: [] };
  }

  try {
    const formData = new FormData();
    for (const input of inputs) {
      const filename =
        input.originalFilename || input.uri.split("/").pop() || "document.pdf";
      const type = input.mimeType || inferMimeType(filename);
      formData.append("files", {
        uri: input.uri,
        name: filename,
        type,
      } as any);
    }

    const endpoint =
      classificationSource === "AI"
        ? "/documents/upload/ai/bulk"
        : "/documents/upload/manual/bulk";

    const response = await api.post<GateBulkUploadResponse>(
      endpoint,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );

    return {
      total: response.data.total || inputs.length,
      succeeded: response.data.documents || [],
      failed: (response.data.failures || []).map((failure) => {
        const matchingInput = inputs.find(
          (input) => input.originalFilename === failure.originalName,
        );
        return {
          uri: matchingInput?.uri || "",
          originalFilename: failure.originalName,
          message: failure.message,
        };
      }),
    };
  } catch (error) {
    const appError = parseApiError(error);
    if (appError.statusCode === 404 || appError.statusCode === 405) {
      // Backward compatibility during rollout: fallback to parallel single uploads.
      return uploadDocumentsBulkLegacy(
        inputs,
        classificationSource,
        concurrency,
      );
    }
    throw error;
  }
};

const uploadDocumentsBulkLegacy = async (
  inputs: BulkUploadInput[],
  classificationSource: "AI" | "MANUAL" = "AI",
  concurrency = 3,
): Promise<BulkUploadResult> => {
  const safeConcurrency = Math.max(1, Math.min(concurrency, 5));
  const queue = [...inputs];
  const succeeded: Document[] = [];
  const failed: BulkUploadFailure[] = [];

  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) {
        return;
      }

      try {
        const document = await uploadDocument(
          item.uri,
          classificationSource,
          item.originalFilename,
          item.mimeType,
        );
        succeeded.push(document);
      } catch (error) {
        const appError = parseApiError(error);
        failed.push({
          uri: item.uri,
          originalFilename: item.originalFilename,
          message: appError.message,
          statusCode: appError.statusCode,
        });
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(safeConcurrency, inputs.length) }, () =>
      worker(),
    ),
  );

  return {
    total: inputs.length,
    succeeded,
    failed,
  };
};

export const getDocuments = async (
  page = 1,
  limit = 20,
  categoryId?: string,
  search?: string,
  processingStatus?: string | string[],
  classificationSource?: string,
  tagId?: string,
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
    if (Array.isArray(processingStatus)) {
      params.append(
        "filter.processingStatus",
        `$in:${processingStatus.join(",")}`,
      );
    } else {
      params.append("filter.processingStatus", `$eq:${processingStatus}`);
    }
  }
  if (classificationSource) {
    params.append("filter.classificationSource", `$eq:${classificationSource}`);
  }
  if (tagId) {
    params.append("filter.tags.id", `$eq:${tagId}`);
  }

  const response = await api.get(`/documents?${params.toString()}`);
  return response.data;
};

export const getRecentDocuments = async (limit = 5): Promise<Document[]> => {
  const response = await getDocuments(1, limit);
  return response.data;
};

export const getActionRequiredDocuments = async (
  limit = 3,
): Promise<{ data: Document[]; meta: any }> => {
  return getDocuments(
    1,
    limit,
    undefined,
    undefined,
    ["PENDING", "FAILED"],
    undefined,
  );
};

export const getDocumentUrl = async (
  id: string,
): Promise<{ document: Document; url: string }> => {
  const response = await api.get(`/documents/${id}`);
  return response.data;
};

export const updateDocument = async (
  id: string,
  data: Partial<Document>,
): Promise<Document> => {
  const response = await api.patch(`/documents/${id}`, data);
  return response.data;
};

export const bulkUpdateDocuments = async (
  documentIds: string[],
  categoryId: string,
): Promise<void> => {
  await api.patch("/documents/bulk-update", { documentIds, categoryId });
};

export const triggerAiClassification = async (
  id: string,
): Promise<Document> => {
  const response = await api.post(`/documents/${id}/classify`);
  return response.data;
};

export const triggerAiTitleGeneration = async (
  id: string,
): Promise<Document> => {
  const response = await api.post(`/documents/${id}/generate-title`);
  return response.data;
};

export const triggerIndex = async (id: string): Promise<Document> => {
  const response = await api.post(`/documents/${id}/index`);
  return response.data;
};

// Backward-compatible alias for call sites not yet migrated.
export const triggerEmbedding = triggerIndex;

export const deleteDocument = async (id: string): Promise<void> => {
  await api.delete(`/documents/${id}`);
};
