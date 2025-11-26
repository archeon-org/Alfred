import { useMutation } from "@tanstack/react-query";
import { uploadDocument } from "../services/document";

export const useDocumentUpload = () => {
  const { mutateAsync, isPending, error, isSuccess } = useMutation({
    mutationFn: ({
      uri,
      classificationSource,
    }: {
      uri: string;
      classificationSource?: "AI" | "MANUAL";
    }) => uploadDocument(uri, classificationSource),
  });

  return {
    upload: (uri: string, classificationSource?: "AI" | "MANUAL") =>
      mutateAsync({ uri, classificationSource }),
    isUploading: isPending,
    error,
    isSuccess,
  };
};
