// src/hooks/useUser.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProfile, updateUser, UpdateUserDto, User } from "../services";

export const USER_QUERY_KEY = ["user"];

export const useUser = () => {
  return useQuery<User>({
    queryKey: USER_QUERY_KEY,
    queryFn: getProfile,
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserDto) => updateUser(data),
    onSuccess: (data) => {
      // Update the cache with the new user data
      queryClient.setQueryData(USER_QUERY_KEY, data);
      // Alternatively, invalidate to refetch
      // queryClient.invalidateQueries({ queryKey: USER_QUERY_KEY });
    },
  });
};
