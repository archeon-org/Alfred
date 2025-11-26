import { useState } from "react";
import { Alert } from "react-native";
import { Category } from "@archeon-org/types";
import { useCategories } from "./useCategories";
import { showError } from "../utils/apiError";

export const useCategoryScreenLogic = () => {
  const [search, setSearch] = useState("");
  const [hideEmpty, setHideEmpty] = useState(true);

  const {
    categories,
    isLoading,
    refetch,
    addCategory,
    editCategory,
    removeCategory,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCategories(search, hideEmpty);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const handleOpenModal = (category?: Category) => {
    setEditingCategory(category || null);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingCategory(null);
  };

  const handleSaveCategory = async (data: {
    name: string;
    icon: string;
    color: string;
  }) => {
    try {
      if (editingCategory) {
        await editCategory(editingCategory.id, data);
      } else {
        await addCategory(data.name, data.icon, data.color);
      }
      setModalVisible(false);
    } catch (error) {
      console.error("Failed to save category", error);
      showError(error, "Failed to save category");
    }
  };

  const handleDeleteCategory = (category: Category) => {
    Alert.alert(
      "Delete Category",
      `Are you sure you want to delete "${category.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => removeCategory(category.id),
        },
      ]
    );
  };

  return {
    categories,
    isLoading,
    refetch,
    modalVisible,
    editingCategory,
    handleOpenModal,
    handleCloseModal,
    handleSaveCategory,
    handleDeleteCategory,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    search,
    setSearch,
    hideEmpty,
    setHideEmpty,
  };
};
