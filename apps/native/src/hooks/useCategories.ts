import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Category } from "@archeon-org/types";
import {
  getCategoryById,
  getCategoryTree,
  createCategory,
  createSubfolder,
  updateCategory,
  deleteCategory,
} from "../services";
import { useMemo } from "react";

type CategoryTreeNode = Category & { children?: CategoryTreeNode[] };

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

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["categories-tree", hideEmpty],
    queryFn: () => getCategoryTree(hideEmpty),
  });

  const categoryTree = (data || []) as CategoryTreeNode[];

  const flattenTree = (nodes: CategoryTreeNode[]): Category[] => {
    const output: Category[] = [];
    const walk = (entries: CategoryTreeNode[]) => {
      for (const entry of entries) {
        output.push({ ...entry, children: undefined });
        if (entry.children?.length) {
          walk(entry.children);
        }
      }
    };
    walk(nodes);
    return output;
  };

  const allCategories = useMemo(
    () => flattenTree(categoryTree),
    [categoryTree],
  );

  const categories = useMemo(() => {
    if (!search?.trim()) {
      return allCategories;
    }
    const needle = search.trim().toLowerCase();
    return allCategories.filter((category) =>
      category.name.toLowerCase().includes(needle),
    );
  }, [allCategories, search]);

  const rootCategories = useMemo(
    () =>
      categoryTree.map((category) => ({
        ...category,
        children: undefined,
      })),
    [categoryTree],
  );

  const addMutation = useMutation({
    mutationFn: (newCategory: {
      name: string;
      icon: string;
      color: string;
      parentId?: string;
    }) =>
      newCategory.parentId
        ? createSubfolder(newCategory.parentId, newCategory)
        : createCategory(newCategory),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["categories-tree"] });
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
      queryClient.invalidateQueries({ queryKey: ["categories-tree"] });
    },
    onError: (error) => {
      console.error("Failed to update category", error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["categories-tree"] });
    },
    onError: (error) => {
      console.error("Failed to delete category", error);
    },
  });

  return {
    categories,
    categoryTree,
    rootCategories,
    isLoading,
    isFetching,
    isError,
    fetchNextPage: async () => undefined,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch,
    addCategory: (
      name: string,
      icon: string,
      color: string,
      parentId?: string | null,
    ) =>
      addMutation.mutateAsync({
        name,
        icon,
        color,
        parentId: parentId || undefined,
      }),
    editCategory: (id: string, data: Partial<Category>) =>
      editMutation.mutateAsync({ id, data }),
    removeCategory: (id: string) => deleteMutation.mutateAsync(id),
  };
};
