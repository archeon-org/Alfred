import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTags, createTag } from "../services/tag";

export const useTags = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tags"],
    queryFn: getTags,
  });

  return {
    tags: data || [],
    isLoading,
    error,
    refetch,
  };
};

export const useTagMutations = () => {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string }) =>
      createTag(name, color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });

  return {
    createTag: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
};
