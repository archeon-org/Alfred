import { useState, useCallback, useEffect } from "react";
import { Template } from "@archeon-org/types";
import {
  getTemplates,
  applyTemplate,
  getTemplateCategories,
} from "../services";
import { useAuth } from "../context/AuthContext";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

export const useOnboarding = () => {
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);

  // Debounce search to avoid refetching on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["templates", debouncedSearch],
    queryFn: ({ pageParam = 1 }) =>
      getTemplates(pageParam, 10, debouncedSearch),
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.currentPage < lastPage.meta.totalPages) {
        return lastPage.meta.currentPage + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const templates = data?.pages.flatMap((page) => page.data) || [];

  const {
    data: categoriesData,
    fetchNextPage: fetchNextCategories,
    hasNextPage: hasNextCategories,
    isFetchingNextPage: isFetchingNextCategories,
    isLoading: isLoadingCategories,
  } = useInfiniteQuery({
    queryKey: ["template-categories", selectedTemplateId],
    queryFn: ({ pageParam = 1 }) =>
      getTemplateCategories(selectedTemplateId!, pageParam, 20),
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.currentPage < lastPage.meta.totalPages) {
        return lastPage.meta.currentPage + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    enabled: !!selectedTemplateId,
  });

  const templateCategories =
    categoriesData?.pages.flatMap((page) => page.data) || [];

  const applyMutation = useMutation({
    mutationFn: (templateId: string) => applyTemplate(templateId),
    onSuccess: async () => {
      // Show biometric setup modal instead of immediately refreshing
      setShowBiometricSetup(true);
    },
    onError: (error) => {
      console.error("Failed to apply template", error);
    },
  });

  const handleApplyTemplate = async () => {
    if (selectedTemplateId) {
      await applyMutation.mutateAsync(selectedTemplateId);
    }
  };

  const handleBiometricSetupComplete = async () => {
    setShowBiometricSetup(false);
    await refreshUser();
    queryClient.invalidateQueries({ queryKey: ["templates"] });
  };

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  return {
    templates,
    loading: isLoading,
    applying: applyMutation.isPending ? "applying" : null,
    handleSelectTemplate: setSelectedTemplateId,
    selectedTemplateId,
    templateCategories,
    isLoadingCategories,
    fetchNextCategories,
    hasNextCategories,
    isFetchingNextCategories,
    handleApplyTemplate,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    searchQuery,
    handleSearch,
    showBiometricSetup,
    handleBiometricSetupComplete,
  };
};
