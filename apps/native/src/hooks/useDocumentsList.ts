import { useLocalSearchParams } from "expo-router";
import { useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { getDocuments } from "../services";

export const useDocumentsList = (
  search?: string,
  filters?: {
    processingStatus?: string;
    classificationSource?: string;
    tagId?: string;
  },
) => {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ["documents", "all", categoryId, search, filters],
    queryFn: ({ pageParam = 1 }) =>
      getDocuments(
        pageParam,
        20,
        categoryId,
        search,
        filters?.processingStatus,
        filters?.classificationSource,
        filters?.tagId,
      ),
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.currentPage < lastPage.meta.totalPages) {
        return lastPage.meta.currentPage + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    placeholderData: keepPreviousData,
  });

  const allDocuments = data?.pages.flatMap((page) => page.data) || [];
  const documents = Array.from(
    new Map(allDocuments.map((item) => [item.id, item])).values(),
  );

  return {
    documents,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
    categoryId,
  };
};

export const useActionRequiredDocumentsList = () => {
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ["documents", "action-required-list"],
    queryFn: ({ pageParam = 1 }) =>
      getDocuments(
        pageParam,
        20,
        undefined,
        undefined,
        ["PENDING", "FAILED"],
        undefined,
      ),
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
    new Map(allDocuments.map((item) => [item.id, item])).values(),
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
