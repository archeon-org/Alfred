import { useMutation } from "@tanstack/react-query";
import {
  BulkUploadInput,
  uploadDocument,
  uploadDocumentsBulk,
} from "../services/document";

export const useDocumentUpload = () => {
  const {
    mutateAsync: uploadSingle,
    isPending: isSingleUploading,
    error: singleError,
    isSuccess: isSingleSuccess,
  } = useMutation({
    mutationFn: ({
      uri,
      classificationSource,
      originalFilename,
      mimeType,
    }: {
      uri: string;
      classificationSource?: "AI" | "MANUAL";
      originalFilename?: string;
      mimeType?: string;
    }) => uploadDocument(uri, classificationSource, originalFilename, mimeType),
  });

  const {
    mutateAsync: uploadBulkMutation,
    isPending: isBulkUploading,
    error: bulkError,
    isSuccess: isBulkSuccess,
  } = useMutation({
    mutationFn: ({
      documents,
      classificationSource,
      concurrency,
    }: {
      documents: BulkUploadInput[];
      classificationSource?: "AI" | "MANUAL";
      concurrency?: number;
    }) => uploadDocumentsBulk(documents, classificationSource, concurrency),
  });

  return {
    upload: (
      uri: string,
      classificationSource?: "AI" | "MANUAL",
      originalFilename?: string,
      mimeType?: string,
    ) =>
      uploadSingle({ uri, classificationSource, originalFilename, mimeType }),
    uploadBulk: (
      documents: BulkUploadInput[],
      classificationSource?: "AI" | "MANUAL",
      concurrency?: number,
    ) => uploadBulkMutation({ documents, classificationSource, concurrency }),
    isUploading: isSingleUploading || isBulkUploading,
    error: singleError || bulkError,
    isSuccess: isSingleSuccess || isBulkSuccess,
  };
};
