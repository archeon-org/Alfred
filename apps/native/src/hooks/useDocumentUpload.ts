import { useMutation } from "@tanstack/react-query";
import { uploadDocument } from "../services/document";

export const useDocumentUpload = () => {
  const { mutateAsync, isPending, error, isSuccess } = useMutation({
    mutationFn: ({
      uri,
      classificationSource,
      originalFilename,
    }: {
      uri: string;
      classificationSource?: "AI" | "MANUAL";
      originalFilename?: string;
    }) => uploadDocument(uri, classificationSource, originalFilename),
  });

  return {
    upload: (
      uri: string,
      classificationSource?: "AI" | "MANUAL",
      originalFilename?: string
    ) => mutateAsync({ uri, classificationSource, originalFilename }),
    isUploading: isPending,
    error,
    isSuccess,
  };
};
