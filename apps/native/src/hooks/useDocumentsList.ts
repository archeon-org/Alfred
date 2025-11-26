import { useLocalSearchParams } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getDocuments } from "../services";

export const useDocumentsList = (search?: string) => {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ["documents", "all", categoryId, search],
    queryFn: ({ pageParam = 1 }) =>
      getDocuments(pageParam, 20, categoryId, search),
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.currentPage < lastPage.meta.totalPages) {
        return lastPage.meta.currentPage + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const allDocuments = data?.pages.flatMap((page) => page.data) || [];
  const documents = Array.from(
    new Map(allDocuments.map((item) => [item.id, item])).values()
  );

  return {
    documents,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
    categoryId,
  };
};

export const usePendingManualDocumentsList = () => {
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ["documents", "pending-manual-list"],
    queryFn: ({ pageParam = 1 }) =>
      getDocuments(pageParam, 20, undefined, undefined, "PENDING", "MANUAL"),
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.currentPage < lastPage.meta.totalPages) {
        return lastPage.meta.currentPage + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const allDocuments = data?.pages.flatMap((page) => page.data) || [];
  const documents = Array.from(
    new Map(allDocuments.map((item) => [item.id, item])).values()
  );

  return {
    documents,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  };
};
