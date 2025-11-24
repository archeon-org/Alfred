import { useMutation } from "@tanstack/react-query";
import { uploadDocument } from "../services/document";

export const useDocumentUpload = () => {
  const { mutateAsync, isPending, error, isSuccess } = useMutation({
    mutationFn: uploadDocument,
  });

  return {
    upload: mutateAsync,
    isUploading: isPending,
    error,
    isSuccess,
  };
};
