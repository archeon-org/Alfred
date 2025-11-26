import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDocuments,
  getDocumentUrl,
  getRecentDocuments,
  getActionRequiredDocuments,
  updateDocument,
  bulkUpdateDocuments,
  triggerAiClassification,
  deleteDocument,
} from "../services";
import { Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";

export const useDocuments = (categoryId?: string) => {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["documents", categoryId],
    queryFn: () => getDocuments(1, 100, categoryId), // Default to page 1, limit 100 for now
  });

  return {
    documents: data?.data || [],
    isLoading,
    error,
    refetch,
    isRefetching,
  };
};

export const useRecentDocuments = (limit = 5) => {
  return useQuery({
    queryKey: ["documents", "recent", limit],
    queryFn: () => getRecentDocuments(limit),
  });
};

export const useActionRequiredDocuments = (limit = 3) => {
  return useQuery({
    queryKey: ["documents", "action-required", limit],
    queryFn: () => getActionRequiredDocuments(limit + 1),
  });
};

export const useDocumentViewer = () => {
  const { mutateAsync: openDocument, isPending: isOpening } = useMutation({
    mutationFn: async (id: string) => {
      const { url } = await getDocumentUrl(id);
      await WebBrowser.openBrowserAsync(url);
    },
    onError: (error) => {
      console.error("Failed to open document:", error);
      Alert.alert("Error", "Failed to open document.");
    },
  });

  return {
    openDocument,
    isOpening,
  };
};

export const useDocument = (id: string) => {
  return useQuery({
    queryKey: ["document", id],
    queryFn: () => getDocumentUrl(id),
    enabled: !!id,
  });
};

export const useDocumentMutations = () => {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      updateDocument(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document"] });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: ({
      documentIds,
      categoryId,
    }: {
      documentIds: string[];
      categoryId: string;
    }) => bulkUpdateDocuments(documentIds, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const triggerAiMutation = useMutation({
    mutationFn: (id: string) => triggerAiClassification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  return {
    updateDocument: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    bulkUpdateDocuments: bulkUpdateMutation.mutateAsync,
    isBulkUpdating: bulkUpdateMutation.isPending,
    triggerAiClassification: triggerAiMutation.mutateAsync,
    isTriggeringAi: triggerAiMutation.isPending,
    deleteDocument: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
};
