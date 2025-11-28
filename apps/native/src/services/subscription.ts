import api from "./api";
import {
  SubscriptionStatus,
  CreditOperation,
  CreditPack,
  StoragePack,
  SubscriptionTier,
  TierLimits,
  CREDIT_PACKS,
  STORAGE_PACKS,
  CREDIT_COSTS,
  TIER_LIMITS,
} from "@archeon-org/types";

export type { SubscriptionStatus, TierLimits };
export {
  CreditPack,
  StoragePack,
  SubscriptionTier,
  CREDIT_PACKS,
  STORAGE_PACKS,
  CREDIT_COSTS,
  TIER_LIMITS,
};

/**
 * Get current subscription status
 */
export const getSubscriptionStatus = async (): Promise<SubscriptionStatus> => {
  const response = await api.get<SubscriptionStatus>("/subscription/status");
  return response.data;
};

/**
 * Get current credit balance
 */
export const getCredits = async (): Promise<{ credits: number }> => {
  const response = await api.get<{ credits: number }>("/subscription/credits");
  return response.data;
};

/**
 * Check if user can afford an operation
 */
export const checkCredits = async (
  operation: CreditOperation
): Promise<{ canAfford: boolean; cost: number; currentCredits: number }> => {
  const response = await api.post<{
    canAfford: boolean;
    cost: number;
    currentCredits: number;
  }>("/subscription/check", { operation });
  return response.data;
};

/**
 * Get available subscription tiers and their features
 */
export const getSubscriptionTiers = async (): Promise<
  Record<SubscriptionTier, TierLimits>
> => {
  const response = await api.get<Record<SubscriptionTier, TierLimits>>(
    "/subscription/tiers"
  );
  return response.data;
};

/**
 * Upgrade subscription tier
 * Note: In production, this should handle payment first
 */
export const upgradeTier = async (
  tier: SubscriptionTier
): Promise<SubscriptionStatus> => {
  const response = await api.post<SubscriptionStatus>("/subscription/upgrade", {
    tier,
  });
  return response.data;
};

/**
 * Format bytes to human readable string
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

/**
 * Format credits with proper plural
 */
export const formatCredits = (credits: number): string => {
  return `${credits} credit${credits !== 1 ? "s" : ""}`;
};

/**
 * Get operation cost
 */
export const getOperationCost = (operation: CreditOperation): number => {
  return CREDIT_COSTS[operation];
};
