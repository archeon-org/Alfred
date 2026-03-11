import { useState, useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  useDocument,
  useDocumentViewer,
  useDocumentMutations,
} from "./useDocuments";
import { useCategories } from "./useCategories";
import { useTags, useTagMutations } from "./useTags";
import { Category, Tag } from "@archeon-org/types";
import { useToast } from "../context/ToastContext";
import { parseApiError } from "../utils/apiError";
import { useQueryClient } from "@tanstack/react-query";
import { SUBSCRIPTION_QUERY_KEY } from "./useSubscription";

/**
 * Check if the error is related to insufficient credits
 */
const isInsufficientCreditsError = (message: string): boolean => {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("insufficient credits") ||
    lowerMessage.includes("not enough credits")
  );
};

export const useDocumentDetailsLogic = () => {
  const { id, openCategoryModal } = useLocalSearchParams<{
    id: string;
    openCategoryModal?: string;
  }>();
  const { data, isLoading, error, refetch, isRefetching } = useDocument(id!);
  const { openDocument, isOpening } = useDocumentViewer();
  const {
    updateDocument,
    isUpdating,
    triggerAiClassification,
    isTriggeringAi,
    generateAiTitle,
    isGeneratingTitle,
    triggerIndex,
    isTriggeringIndex,
  } = useDocumentMutations();
  const { tags: allTags } = useTags();
  const { createTag, isCreating: isCreatingTag } = useTagMutations();
  const {
    categories,
    addCategory,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCategories();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { success, info, error: showError } = useToast();

  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [titleModalVisible, setTitleModalVisible] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [editingTitle, setEditingTitle] = useState("");

  useEffect(() => {
    if (openCategoryModal === "true") {
      setCategoryModalVisible(true);
    }
  }, [openCategoryModal]);

  const filteredTags = allTags.filter((t) =>
    t.name.toLowerCase().includes(tagSearch.toLowerCase()),
  );

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(categorySearch.toLowerCase()),
  );

  const handleUpdateCategory = async (category: Category) => {
    if (!data?.document) return;
    try {
      await updateDocument({
        id: data.document.id,
        data: { categoryId: category.id },
      });
      setCategoryModalVisible(false);
      refetch();
      success("Category Updated", "Document category has been changed");
    } catch (err) {
      const appError = parseApiError(err);
      showError("Failed to update category", appError.message);
    }
  };

  const handleAddTag = async (tag: Tag) => {
    if (!data?.document) return;
    try {
      const currentTagIds = data.document.tags?.map((t) => t.id) || [];
      if (currentTagIds.includes(tag.id)) {
        info("Already Added", "This tag is already on the document");
        return;
      }

      await updateDocument({
        id: data.document.id,
        data: { tagIds: [...currentTagIds, tag.id] },
      });

      setTagModalVisible(false);
      setTagSearch("");
      refetch();
      success("Tag Added", `"${tag.name}" has been added`);
    } catch (err) {
      const appError = parseApiError(err);
      showError("Failed to add tag", appError.message);
    }
  };

  const handleCreateTag = async () => {
    if (!tagSearch.trim()) return;

    try {
      const tag = await createTag({ name: tagSearch.trim() });
      await handleAddTag(tag);
    } catch (err) {
      const appError = parseApiError(err);
      showError("Failed to create tag", appError.message);
    }
  };

  const handleQuickCreateCategory = async () => {
    if (!categorySearch.trim() || !data?.document) return;

    try {
      const newCategory = await addCategory(
        categorySearch.trim(),
        "folder-outline",
        "#4F46E5",
      );

      await updateDocument({
        id: data.document.id,
        data: { categoryId: newCategory.id },
      });

      setCategoryModalVisible(false);
      setCategorySearch("");
      refetch();
      success("Category Created", `"${newCategory.name}" created and selected`);
    } catch (err) {
      const appError = parseApiError(err);
      showError("Failed to create category", appError.message);
    }
  };

  /**
   * Handle AI-related errors - redirect to subscription page if insufficient credits
   */
  const handleAiError = (err: unknown, defaultMessage: string) => {
    const appError = parseApiError(err);
    if (isInsufficientCreditsError(appError.message)) {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
      router.push({
        pathname: "/(app)/profile/subscription",
        params: { reason: "insufficient_credits" },
      });
    } else {
      showError(defaultMessage, appError.message);
    }
  };

  const handleTriggerAi = async () => {
    if (!data?.document) return;
    try {
      await triggerAiClassification(data.document.id);
      refetch();
      success("AI Classification", "Classification has been triggered");
    } catch (err) {
      handleAiError(err, "Failed to trigger AI classification");
    }
  };

  const handleOpenTitleModal = () => {
    if (data?.document) {
      setEditingTitle(data.document.title || "");
      setTitleModalVisible(true);
    }
  };

  const handleSaveTitle = async () => {
    if (!data?.document || !editingTitle.trim()) return;
    try {
      await updateDocument({
        id: data.document.id,
        data: { title: editingTitle.trim() },
      });
      setTitleModalVisible(false);
      refetch();
      success("Title Updated", "Document title has been changed");
    } catch (err) {
      const appError = parseApiError(err);
      showError("Failed to update title", appError.message);
    }
  };

  const handleGenerateAiTitle = async () => {
    if (!data?.document) return;
    try {
      await generateAiTitle(data.document.id);
      setTitleModalVisible(false);
      info("Title Generation Started", "You'll be notified when it's ready");
    } catch (err) {
      handleAiError(err, "Failed to trigger AI title generation");
    }
  };

  const handleTriggerIndex = async () => {
    if (!data?.document) return;
    try {
      await triggerIndex(data.document.id);
      info("Indexing Started", "You'll be notified when search is enabled");
    } catch (err) {
      handleAiError(err, "Failed to enable search");
    }
  };

  return {
    document: data?.document,
    isLoading,
    error,
    refetch,
    isRefetching,
    openDocument,
    isOpening,
    router,
    categoryModalVisible,
    setCategoryModalVisible,
    tagModalVisible,
    setTagModalVisible,
    titleModalVisible,
    setTitleModalVisible,
    tagSearch,
    setTagSearch,
    categorySearch,
    setCategorySearch,
    editingTitle,
    setEditingTitle,
    filteredTags,
    filteredCategories,
    handleUpdateCategory,
    handleAddTag,
    handleCreateTag,
    handleQuickCreateCategory,
    handleTriggerAi,
    isTriggeringAi,
    handleOpenTitleModal,
    handleSaveTitle,
    handleGenerateAiTitle,
    handleTriggerIndex,
    isTriggeringIndex,
    // Backward-compatible aliases
    handleTriggerEmbedding: handleTriggerIndex,
    isTriggeringEmbedding: isTriggeringIndex,
    isUpdating,
    isGeneratingTitle,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
};
