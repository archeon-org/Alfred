import { useQuery, useMutation } from "@tanstack/react-query";
import { getDocuments, getDocumentUrl } from "../services/document";
import { Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";

export const useDocuments = () => {
  const {
    data: documents,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["documents"],
    queryFn: getDocuments,
  });

  return {
    documents,
    isLoading,
    error,
    refetch,
  };
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
