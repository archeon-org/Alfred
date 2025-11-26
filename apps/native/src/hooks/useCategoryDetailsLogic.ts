import { useState, useMemo } from "react";
import { Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCategories } from "./useCategories";
import { useDocuments, useDocumentMutations } from "./useDocuments";
import { showError } from "../utils/apiError";

export const useCategoryDetailsLogic = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { categories } = useCategories();
  const category = categories?.find((c) => c.id === id);

  // Documents in this category
  const {
    documents: categoryDocuments,
    isLoading: isLoadingDocs,
    refetch: refetchDocs,
    isRefetching,
  } = useDocuments(id);

  // All documents for selection
  const { documents: allDocuments, isLoading: isLoadingAllDocs } =
    useDocuments();

  const { bulkUpdateDocuments, isBulkUpdating } = useDocumentMutations();

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  const availableDocuments = useMemo(() => {
    if (!allDocuments) return [];
    // Filter out documents already in this category
    return allDocuments.filter((doc) => doc.categoryId !== id);
  }, [allDocuments, id]);

  const handleToggleSelection = (docId: string) => {
    const newSelection = new Set(selectedDocIds);
    if (newSelection.has(docId)) {
      newSelection.delete(docId);
    } else {
      newSelection.add(docId);
    }
    setSelectedDocIds(newSelection);
  };

  const handleAddDocuments = async () => {
    if (selectedDocIds.size === 0) return;

    try {
      await bulkUpdateDocuments({
        documentIds: Array.from(selectedDocIds),
        categoryId: id!,
      });
      setIsAddModalVisible(false);
      setSelectedDocIds(new Set());
      refetchDocs();
      Alert.alert("Success", "Documents added to category");
    } catch (error) {
      showError(error, "Failed to add documents");
    }
  };

  return {
    id,
    router,
    category,
    categoryDocuments,
    isLoadingDocs,
    refetchDocs,
    isRefetching,
    isAddModalVisible,
    setIsAddModalVisible,
    selectedDocIds,
    handleToggleSelection,
    handleAddDocuments,
    availableDocuments,
    isLoadingAllDocs,
    isBulkUpdating,
  };
};
