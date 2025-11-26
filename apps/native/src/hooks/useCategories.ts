import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Alert } from "react-native";
import { Category } from "@archeon-org/types";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../services";

export const useCategories = () => {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["categories"],
    queryFn: ({ pageParam = 1 }) => getCategories(pageParam, 10),
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.currentPage < lastPage.meta.totalPages) {
        return lastPage.meta.currentPage + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const allCategories = data?.pages.flatMap((page) => page.data) || [];
  // Deduplicate categories by ID to prevent "same key" errors in FlatList
  const categories = Array.from(
    new Map(allCategories.map((item) => [item.id, item])).values()
  );

  const addMutation = useMutation({
    mutationFn: (newCategory: { name: string; icon: string; color: string }) =>
      createCategory(newCategory),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => {
      console.error("Failed to create category", error);
      Alert.alert("Error", "Failed to create category");
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Category> }) =>
      updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => {
      console.error("Failed to update category", error);
      Alert.alert("Error", "Failed to update category");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => {
      console.error("Failed to delete category", error);
      Alert.alert("Error", "Failed to delete category");
    },
  });

  return {
    categories,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    addCategory: (name: string, icon: string, color: string) =>
      addMutation.mutateAsync({ name, icon, color }),
    editCategory: (id: string, data: Partial<Category>) =>
      editMutation.mutateAsync({ id, data }),
    removeCategory: (id: string) => deleteMutation.mutateAsync(id),
  };
};
