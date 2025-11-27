import { useState, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCategory } from "./useCategories";
import { useDocuments, useDocumentMutations } from "./useDocuments";
import { useToast } from "../context/ToastContext";
import { parseApiError } from "../utils/apiError";

export const useCategoryDetailsLogic = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { category, isLoading: isLoadingCategory } = useCategory(id);
  const { success, error: showError } = useToast();

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
      success("Documents Added", "Documents have been added to category");
    } catch (error) {
      const appError = parseApiError(error);
      showError("Failed to add documents", appError.message);
    }
  };

  return {
    id,
    router,
    category,
    isLoadingCategory,
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
