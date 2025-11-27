import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { Category } from "@archeon-org/types";
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../services";

// Hook to fetch a single category by ID
export const useCategory = (id: string | undefined) => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["category", id],
    queryFn: () => getCategoryById(id!),
    enabled: !!id,
  });

  return {
    category: data,
    isLoading,
    isError,
    refetch,
  };
};

export const useCategories = (search?: string, hideEmpty?: boolean) => {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["categories", search, hideEmpty],
    queryFn: ({ pageParam = 1 }) =>
      getCategories(pageParam, 10, search, hideEmpty),
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.currentPage < lastPage.meta.totalPages) {
        return lastPage.meta.currentPage + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    placeholderData: keepPreviousData,
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
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => {
      console.error("Failed to delete category", error);
    },
  });

  return {
    categories,
    isLoading,
    isFetching,
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
