import { useState, useEffect } from "react";
import { Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  useDocument,
  useDocumentViewer,
  useDocumentMutations,
} from "./useDocuments";
import { useCategories } from "./useCategories";
import { useTags, useTagMutations } from "./useTags";
import { Category, Tag } from "@archeon-org/types";
import { showError } from "../utils/apiError";

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
    t.name.toLowerCase().includes(tagSearch.toLowerCase())
  );

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(categorySearch.toLowerCase())
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
      Alert.alert("Success", "Category updated successfully");
    } catch (error) {
      showError(error, "Failed to update category");
    }
  };

  const handleAddTag = async (tag: Tag) => {
    if (!data?.document) return;
    try {
      const currentTagIds = data.document.tags?.map((t) => t.id) || [];
      if (currentTagIds.includes(tag.id)) {
        Alert.alert("Info", "Tag already added");
        return;
      }

      await updateDocument({
        id: data.document.id,
        data: { tagIds: [...currentTagIds, tag.id] },
      });

      setTagModalVisible(false);
      setTagSearch("");
      refetch();
      Alert.alert("Success", "Tag added successfully");
    } catch (error) {
      showError(error, "Failed to add tag");
    }
  };

  const handleCreateTag = async () => {
    if (!tagSearch.trim()) return;

    try {
      const tag = await createTag({ name: tagSearch.trim() });
      await handleAddTag(tag);
    } catch (error) {
      showError(error, "Failed to create tag");
    }
  };

  const handleQuickCreateCategory = async () => {
    if (!categorySearch.trim() || !data?.document) return;

    try {
      const newCategory = await addCategory(
        categorySearch.trim(),
        "folder-outline",
        "#4F46E5"
      );

      await updateDocument({
        id: data.document.id,
        data: { categoryId: newCategory.id },
      });

      setCategoryModalVisible(false);
      setCategorySearch("");
      refetch();
      Alert.alert(
        "Success",
        `Category "${newCategory.name}" created and selected`
      );
    } catch (error) {
      showError(error, "Failed to create category");
    }
  };

  const handleTriggerAi = async () => {
    if (!data?.document) return;
    try {
      await triggerAiClassification(data.document.id);
      refetch();
      Alert.alert("Success", "AI classification triggered");
    } catch (error) {
      showError(error, "Failed to trigger AI classification");
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
      Alert.alert("Success", "Title updated successfully");
    } catch (error) {
      showError(error, "Failed to update title");
    }
  };

  const handleGenerateAiTitle = async () => {
    if (!data?.document) return;
    try {
      await generateAiTitle(data.document.id);
      setTitleModalVisible(false);
      Alert.alert(
        "Title Generation Started",
        "AI is generating a title for your document. You'll receive a notification when it's ready."
      );
    } catch (error) {
      showError(error, "Failed to trigger AI title generation");
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
    isUpdating,
    isGeneratingTitle,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
};
