// src/hooks/useSubscription.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSubscriptionStatus,
  checkCredits,
  upgradeTier,
  SubscriptionStatus,
  SubscriptionTier,
  TIER_LIMITS,
  formatBytes,
} from "../services";
import { CreditOperation } from "@archeon-org/types";

export const SUBSCRIPTION_QUERY_KEY = ["subscription"];

/** Response from checkCredits API */
interface CheckCreditsResponse {
  canAfford: boolean;
  cost: number;
  currentCredits: number;
}

/**
 * Hook to fetch and cache subscription status
 */
export const useSubscription = () => {
  return useQuery<SubscriptionStatus>({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: getSubscriptionStatus,
    staleTime: 30 * 1000, // Consider stale after 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });
};

/**
 * Hook to check if a specific operation can be performed
 */
export const useCanPerformOperation = (operation: CreditOperation) => {
  return useQuery<CheckCreditsResponse>({
    queryKey: ["credits", "check", operation],
    queryFn: () => checkCredits(operation),
    staleTime: 10 * 1000, // Check freshness more frequently
  });
};

/**
 * Hook for upgrading subscription tier
 */
export const useUpgradeTier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tier: SubscriptionTier) => upgradeTier(tier),
    onSuccess: (data) => {
      // Update the subscription cache with new data
      queryClient.setQueryData<SubscriptionStatus>(
        SUBSCRIPTION_QUERY_KEY,
        data
      );
    },
  });
};

/**
 * Derived hook for checking if AI search is available
 * Considers both daily limit and bonus searches
 */
export const useCanAiSearch = () => {
  const { data: subscription, isLoading, error, refetch } = useSubscription();

  const dailyRemaining = subscription
    ? Math.max(0, subscription.dailySearchLimit - subscription.dailySearchUsed)
    : 0;
  const bonusSearches = subscription?.bonusSearches ?? 0;
  const totalRemaining = dailyRemaining + bonusSearches;

  return {
    canSearch: subscription?.canUseAiSearch ?? false,
    dailyRemaining,
    bonusSearches,
    totalRemaining,
    limit: subscription?.dailySearchLimit ?? 0,
    resetsAt: subscription?.dailySearchResetsAt,
    isLoading,
    error,
    refetch,
  };
};

/**
 * Derived hook for credits info
 */
export const useCredits = () => {
  const { data: subscription, isLoading, error, refetch } = useSubscription();

  return {
    credits: subscription?.credits ?? 0,
    tier: subscription?.tier,
    canProcessDocuments: subscription?.canProcessDocuments ?? false,
    isLoading,
    error,
    refetch,
  };
};

/**
 * Derived hook for storage info
 */
export const useStorage = () => {
  const { data: subscription, isLoading, error } = useSubscription();

  const used = subscription?.storageUsed ?? 0;
  const total = subscription?.storageLimit ?? 0;
  const percentage = subscription?.storagePercentUsed ?? 0;

  return {
    usedBytes: used,
    totalBytes: total,
    extraBytes: subscription?.extraStoragePurchased ?? 0,
    percentage,
    isNearLimit: percentage >= 80,
    isAtLimit: percentage >= 100,
    formattedUsed: formatBytes(used),
    formattedTotal: formatBytes(total),
    isLoading,
    error,
  };
};

/**
 * Hook to check if user can upgrade to a specific tier
 */
export const useCanUpgrade = (targetTier: SubscriptionTier) => {
  const { data: subscription, isLoading } = useSubscription();

  if (isLoading || !subscription) {
    return { canUpgrade: false, isLoading };
  }

  const currentTierLimits = TIER_LIMITS[subscription.tier];
  const targetTierLimits = TIER_LIMITS[targetTier];

  // Can upgrade if target tier has higher price
  const canUpgrade =
    targetTierLimits.priceEurMonth > currentTierLimits.priceEurMonth;

  return {
    canUpgrade,
    isLoading,
    currentTier: subscription.tier,
    targetTier,
  };
};
