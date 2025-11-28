import api from "./api";
import {
  SubscriptionTier,
  CreditPack,
  StoragePack,
  UserType,
} from "@archeon-org/types";

/**
 * Admin user list response
 */
export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserType;
  subscriptionTier: SubscriptionTier;
  credits: number;
  bonusSearches: number;
  dailySearchUsed: number;
  storageUsed: number;
  storageLimit: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserDetails
  extends Omit<AdminUser, "dailySearchUsed" | "storageUsed" | "storageLimit"> {
  subscription: {
    tier: SubscriptionTier;
    tierLimits: {
      initialCredits: number;
      monthlyCredits: number;
      dailySearchLimit: number;
      maxTemplates: number;
      hasAdvancedFeatures: boolean;
      storageLimitBytes: number;
      priceEurMonth: number;
    };
    credits: number;
    bonusSearches: number;
    dailySearchUsed: number;
    dailySearchLimit: number;
    storageUsed: number;
    storageLimit: number;
    extraStorage: number;
  };
  updatedAt: string;
}

export interface UsersResponse {
  users: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SubscriptionStats {
  totalUsers: number;
  byTier: Record<SubscriptionTier, number>;
  byRole: Record<UserType, number>;
  totalCredits: number;
  totalBonusSearches: number;
  totalStorageUsedBytes: number;
  activeToday: number;
}

/**
 * Get all users (admin only)
 */
export const getUsers = async (
  page: number = 1,
  limit: number = 20,
  search?: string
): Promise<UsersResponse> => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (search) {
    params.append("search", search);
  }
  const response = await api.get<UsersResponse>(
    `/admin/users?${params.toString()}`
  );
  return response.data;
};

/**
 * Get user details (admin only)
 */
export const getUserDetails = async (
  userId: string
): Promise<AdminUserDetails> => {
  const response = await api.get<AdminUserDetails>(`/admin/users/${userId}`);
  return response.data;
};

/**
 * Upgrade a user's subscription tier (admin only)
 */
export const setUserTier = async (
  userId: string,
  tier: SubscriptionTier
): Promise<AdminUserDetails> => {
  const response = await api.post<AdminUserDetails>(
    `/admin/users/${userId}/upgrade-tier`,
    { tier }
  );
  return response.data;
};

/**
 * Add credits to a user using a credit pack (admin only)
 */
export const addCreditPack = async (
  userId: string,
  pack: CreditPack
): Promise<AdminUserDetails> => {
  const response = await api.post<AdminUserDetails>(
    `/admin/users/${userId}/add-credits`,
    { pack }
  );
  return response.data;
};

/**
 * Add custom credits to a user (admin only)
 */
export const addCustomCredits = async (
  userId: string,
  credits: number,
  bonusSearches: number = 0,
  reason: string = "Admin adjustment"
): Promise<AdminUserDetails> => {
  const response = await api.post<AdminUserDetails>(
    `/admin/users/${userId}/add-credits-custom`,
    { credits, bonusSearches, reason }
  );
  return response.data;
};

/**
 * Set custom bonus searches for a user (admin only)
 */
export const addCustomBonusSearches = async (
  userId: string,
  bonusSearches: number,
  reason: string = "Admin adjustment"
): Promise<AdminUserDetails> => {
  const response = await api.post<AdminUserDetails>(
    `/admin/users/${userId}/set-bonus-searches`,
    { bonusSearches, reason }
  );
  return response.data;
};

/**
 * Set storage for a user using a storage pack (admin only)
 */
export const setStoragePack = async (
  userId: string,
  pack: StoragePack
): Promise<AdminUserDetails> => {
  const response = await api.post<AdminUserDetails>(
    `/admin/users/${userId}/set-storage`,
    { pack }
  );
  return response.data;
};

/**
 * Set custom storage for a user in GB (admin only)
 */
export const setCustomStorage = async (
  userId: string,
  storageGb: number,
  reason: string = "Admin adjustment"
): Promise<AdminUserDetails> => {
  const response = await api.post<AdminUserDetails>(
    `/admin/users/${userId}/set-storage-custom`,
    { storageGb, reason }
  );
  return response.data;
};

/**
 * Reset daily search usage for a user (admin only)
 */
export const resetDailySearch = async (
  userId: string
): Promise<AdminUserDetails> => {
  const response = await api.post<AdminUserDetails>(
    `/admin/users/${userId}/reset-daily-search`
  );
  return response.data;
};

/**
 * Get subscription statistics (admin only)
 */
export const getStats = async (): Promise<SubscriptionStats> => {
  const response = await api.get<SubscriptionStats>("/admin/stats");
  return response.data;
};
