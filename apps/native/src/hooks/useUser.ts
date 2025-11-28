// src/hooks/useUser.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getProfile,
  updateUser,
  UpdateUserDto,
  UserWithSubscription,
} from "../services";
import { mergePreferences } from "@archeon-org/types";

export const USER_QUERY_KEY = ["user"];

export const useUser = () => {
  return useQuery<UserWithSubscription>({
    queryKey: USER_QUERY_KEY,
    queryFn: getProfile,
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserDto) => updateUser(data),
    onMutate: async (newData) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: USER_QUERY_KEY });

      // Snapshot the previous value
      const previousUser =
        queryClient.getQueryData<UserWithSubscription>(USER_QUERY_KEY);

      // Optimistically update the cache
      if (previousUser) {
        const updatedUser = { ...previousUser, ...newData };

        // Properly merge preferences if they're being updated
        if (newData.preferences) {
          updatedUser.preferences = mergePreferences(
            previousUser.preferences,
            newData.preferences
          );
        }

        queryClient.setQueryData<UserWithSubscription>(
          USER_QUERY_KEY,
          updatedUser as UserWithSubscription
        );
      }

      // Return context with previous value for rollback
      return { previousUser };
    },
    onError: (_err, _newData, context) => {
      // Rollback to previous value on error
      if (context?.previousUser) {
        queryClient.setQueryData(USER_QUERY_KEY, context.previousUser);
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: USER_QUERY_KEY });
    },
  });
};
