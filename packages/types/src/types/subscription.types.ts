/**
 * Subscription tier enumeration
 */
export enum SubscriptionTier {
  FREE = "free",
  PRO = "pro",
}

/**
 * Credit pack options for one-time purchases
 */
export enum CreditPack {
  SMALL = "small", // 100 credits → €3.99
  MEDIUM = "medium", // 300 credits → €8.99
  LARGE = "large", // 1000 credits → €19.99
}

/**
 * Credit pack pricing and amounts
 * Includes bonus AI searches that don't reset daily
 */
export const CREDIT_PACKS: Record<
  CreditPack,
  { credits: number; bonusSearches: number; priceEur: number }
> = {
  [CreditPack.SMALL]: { credits: 100, bonusSearches: 20, priceEur: 3.99 },
  [CreditPack.MEDIUM]: { credits: 300, bonusSearches: 75, priceEur: 8.99 },
  [CreditPack.LARGE]: { credits: 1000, bonusSearches: 300, priceEur: 19.99 },
};

/**
 * Storage pack options for one-time purchases
 * Extra storage never expires and stacks with base storage
 */
export enum StoragePack {
  SMALL = "small", // +5 GB → €2.99
  MEDIUM = "medium", // +20 GB → €7.99
  LARGE = "large", // +50 GB → €14.99
}

/**
 * Storage pack pricing and amounts (in bytes)
 */
export const STORAGE_PACKS: Record<
  StoragePack,
  { bytes: number; displaySize: string; priceEur: number }
> = {
  [StoragePack.SMALL]: {
    bytes: 5 * 1024 * 1024 * 1024, // 5 GB
    displaySize: "5 GB",
    priceEur: 2.99,
  },
  [StoragePack.MEDIUM]: {
    bytes: 20 * 1024 * 1024 * 1024, // 20 GB
    displaySize: "20 GB",
    priceEur: 7.99,
  },
  [StoragePack.LARGE]: {
    bytes: 50 * 1024 * 1024 * 1024, // 50 GB
    displaySize: "50 GB",
    priceEur: 14.99,
  },
};

/**
 * AI operations that consume credits
 */
export enum CreditOperation {
  AI_CLASSIFICATION = "ai_classification", // Full document processing (OCR + classify + embed)
  AI_TITLE_GENERATION = "ai_title_generation", // Generate title only
  AI_EMBEDDING = "ai_embedding", // Generate embedding only
}

/**
 * Credit costs per operation
 * These can be adjusted based on actual API costs
 */
export const CREDIT_COSTS: Record<CreditOperation, number> = {
  [CreditOperation.AI_CLASSIFICATION]: 2, // OCR + classify + embed
  [CreditOperation.AI_TITLE_GENERATION]: 1, // Cheap: small LLM call
  [CreditOperation.AI_EMBEDDING]: 1, // Cheap: embedding API call
};

/**
 * Subscription tier limits and features
 */
export interface TierLimits {
  /** Initial credits given at signup */
  initialCredits: number;
  /** Credits given monthly (0 for free tier) */
  monthlyCredits: number;
  /** Maximum daily AI search queries (resets at midnight UTC) */
  dailySearchLimit: number;
  /** Maximum number of templates user can create */
  maxTemplates: number;
  /** Whether user has access to advanced features */
  hasAdvancedFeatures: boolean;
  /** Storage limit in bytes */
  storageLimitBytes: number;
  /** Price in EUR per month (0 for free) */
  priceEurMonth: number;
}

/**
 * Tier limits configuration
 */
export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  [SubscriptionTier.FREE]: {
    initialCredits: 15,
    monthlyCredits: 0,
    dailySearchLimit: 15,
    maxTemplates: 10,
    hasAdvancedFeatures: false,
    storageLimitBytes: 1 * 1024 * 1024 * 1024, // 1 GB
    priceEurMonth: 0,
  },
  [SubscriptionTier.PRO]: {
    initialCredits: 100,
    monthlyCredits: 100,
    dailySearchLimit: 100,
    maxTemplates: 100,
    hasAdvancedFeatures: true,
    storageLimitBytes: 10 * 1024 * 1024 * 1024, // 10 GB
    priceEurMonth: 9.99,
  },
};

/**
 * User subscription status (returned to frontend)
 */
export interface SubscriptionStatus {
  tier: SubscriptionTier;
  credits: number;
  dailySearchUsed: number;
  dailySearchLimit: number;
  dailySearchResetsAt: Date;
  bonusSearches: number; // Purchased searches that don't reset
  canUseAiSearch: boolean;
  canProcessDocuments: boolean;
  // Storage info
  storageUsed: number; // bytes
  storageLimit: number; // bytes (base + extra)
  extraStoragePurchased: number; // bytes of extra storage bought
  storagePercentUsed: number; // 0-100
}

/**
 * Credit transaction types for history/auditing
 */
export enum CreditTransactionType {
  SIGNUP_BONUS = "signup_bonus",
  CREDIT_PACK_PURCHASE = "credit_pack_purchase",
  AI_CLASSIFICATION = "ai_classification",
  AI_TITLE_GENERATION = "ai_title_generation",
  AI_EMBEDDING = "ai_embedding",
  ADMIN_ADJUSTMENT = "admin_adjustment",
  REFUND = "refund",
}

/**
 * Credit transaction record (for future auditing)
 */
export interface CreditTransaction {
  id: string;
  userId: string;
  type: CreditTransactionType;
  amount: number; // Positive for additions, negative for deductions
  balanceAfter: number;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Check if user can perform a credit-consuming operation
 */
export function canAffordOperation(
  credits: number,
  operation: CreditOperation
): boolean {
  return credits >= CREDIT_COSTS[operation];
}

/**
 * Get the cost of an operation
 */
export function getOperationCost(operation: CreditOperation): number {
  return CREDIT_COSTS[operation];
}

/**
 * Check if user can use AI search (daily limit + bonus searches)
 */
export function canUseAiSearch(
  dailySearchUsed: number,
  tier: SubscriptionTier,
  bonusSearches: number = 0
): boolean {
  const dailyLimit = TIER_LIMITS[tier].dailySearchLimit;
  const dailyRemaining = Math.max(0, dailyLimit - dailySearchUsed);
  return dailyRemaining > 0 || bonusSearches > 0;
}
