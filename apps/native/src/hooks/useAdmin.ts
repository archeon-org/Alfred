import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as adminService from "@/services/admin";
import { SubscriptionTier, CreditPack, StoragePack } from "@archeon-org/types";

/**
 * Hook to get paginated list of users
 */
export const useUsers = (
  page: number = 1,
  limit: number = 20,
  search?: string,
) => {
  return useQuery({
    queryKey: ["admin", "users", page, limit, search],
    queryFn: () => adminService.getUsers(page, limit, search),
  });
};

/**
 * Hook to get user details
 */
export const useUserDetails = (userId: string) => {
  return useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => adminService.getUserDetails(userId),
    enabled: !!userId,
  });
};

/**
 * Hook to get subscription statistics
 */
export const useStats = () => {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => adminService.getStats(),
  });
};

/**
 * Hook to set user tier
 */
export const useSetUserTier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      tier,
    }: {
      userId: string;
      tier: SubscriptionTier;
    }) => adminService.setUserTier(userId, tier),
    onSuccess: (data, { userId }) => {
      queryClient.setQueryData(["admin", "user", userId], data);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
};

/**
 * Hook to add credit pack to user
 */
export const useAddCreditPack = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, pack }: { userId: string; pack: CreditPack }) =>
      adminService.addCreditPack(userId, pack),
    onSuccess: (data, { userId }) => {
      queryClient.setQueryData(["admin", "user", userId], data);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
};

/**
 * Hook to add custom credits to user
 */
export const useAddCustomCredits = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      credits,
      bonusSearches = 0,
      reason = "Admin adjustment",
    }: {
      userId: string;
      credits: number;
      bonusSearches?: number;
      reason?: string;
    }) => adminService.addCustomCredits(userId, credits, bonusSearches, reason),
    onSuccess: (data, { userId }) => {
      queryClient.setQueryData(["admin", "user", userId], data);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
};

/**
 * Hook to add custom bonus searches to user
 */
export const useAddCustomBonusSearches = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      bonusSearches,
      reason = "Admin adjustment",
    }: {
      userId: string;
      bonusSearches: number;
      reason?: string;
    }) => adminService.addCustomBonusSearches(userId, bonusSearches, reason),
    onSuccess: (data, { userId }) => {
      queryClient.setQueryData(["admin", "user", userId], data);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
};

/**
 * Hook to set storage pack for user
 */
export const useSetStoragePack = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, pack }: { userId: string; pack: StoragePack }) =>
      adminService.setStoragePack(userId, pack),
    onSuccess: (data, { userId }) => {
      queryClient.setQueryData(["admin", "user", userId], data);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
};

/**
 * Hook to set custom storage for user
 */
export const useSetCustomStorage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      storageGb,
      reason = "Admin adjustment",
    }: {
      userId: string;
      storageGb: number;
      reason?: string;
    }) => adminService.setCustomStorage(userId, storageGb, reason),
    onSuccess: (data, { userId }) => {
      queryClient.setQueryData(["admin", "user", userId], data);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
};

/**
 * Hook to reset daily search usage for user
 */
export const useResetDailySearch = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId }: { userId: string }) =>
      adminService.resetDailySearch(userId),
    onSuccess: (data, { userId }) => {
      queryClient.setQueryData(["admin", "user", userId], data);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
};
