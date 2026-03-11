import { useState } from "react";
import { Category } from "@archeon-org/types";
import { useCategories } from "./useCategories";
import { useDebounce } from "./useDebounce";
import { useToast } from "../context/ToastContext";
import { parseApiError } from "../utils/apiError";

export const useCategoryScreenLogic = () => {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [hideEmpty, setHideEmpty] = useState(true);
  const { confirmDelete, error: showError } = useToast();

  const {
    categories,
    categoryTree,
    rootCategories,
    isLoading,
    isFetching,
    refetch,
    addCategory,
    editCategory,
    removeCategory,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCategories(debouncedSearch, hideEmpty);

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
    parentId?: string | null;
  }) => {
    try {
      if (editingCategory) {
        await editCategory(editingCategory.id, data);
      } else {
        await addCategory(data.name, data.icon, data.color, data.parentId);
      }
      setModalVisible(false);
    } catch (error) {
      console.error("Failed to save category", error);
      const appError = parseApiError(error);
      showError("Failed to save category", appError.message);
    }
  };

  const handleDeleteCategory = (category: Category) => {
    confirmDelete({
      title: "Delete Category",
      message: `Are you sure you want to delete "${category.name}"?`,
      onConfirm: () => removeCategory(category.id),
    });
  };

  return {
    categories,
    categoryTree,
    isLoading,
    isFetching,
    refetch,
    rootCategories,
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
