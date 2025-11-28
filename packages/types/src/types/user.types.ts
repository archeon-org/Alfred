import { Document } from "./document.types";
import { UserPreferences, UserPreferencesUpdate } from "./preferences.types";
import { SubscriptionTier } from "./subscription.types";

/**
 * User type enumeration
 */
export enum UserType {
  ADMIN = "admin",
  USER = "user",
  GUEST = "guest",
}

/**
 * Authentication provider enumeration
 */
export enum AuthProvider {
  LOCAL = "local",
  GOOGLE = "google",
  FACEBOOK = "facebook",
  GITHUB = "github",
  APPLE = "apple",
}

/**
 * Address interface
 */
export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

/**
 * User interface
 */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  profilePicture?: string;
  pushToken?: string;
  storageUsed: number;
  storageLimit: number;
  extraStorage: number; // Extra storage purchased (in bytes)
  preferences: Partial<UserPreferences>;
  searchCount: number;
  address?: Address;
  role: UserType;
  refreshToken?: string;
  provider: AuthProvider;
  lastLoginAt?: Date;
  otpHash?: string;
  otpExpiresAt?: Date;
  isOnboarded: boolean;
  // Subscription fields
  subscriptionTier: SubscriptionTier;
  credits: number;
  dailySearchUsed: number;
  dailySearchResetAt: Date;
  bonusSearches: number; // Purchased AI searches that don't reset daily
  createdAt: Date;
  updatedAt: Date;
  documents?: Document[];
}

/**
 * User creation input type
 */
export type CreateUserInput = Omit<User, "id" | "createdAt" | "updatedAt">;

/**
 * User update input type - uses UserPreferencesUpdate for proper partial updates
 */
export type UpdateUserInput = Partial<
  Omit<User, "id" | "email" | "createdAt" | "updatedAt" | "preferences">
> & {
  preferences?: UserPreferencesUpdate;
};
