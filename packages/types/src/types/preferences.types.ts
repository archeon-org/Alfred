/**
 * User Preferences Type Definitions
 * Strict type system for user preferences stored in the database
 */

/**
 * Home screen preferences
 */
export interface HomePreferences {
  /** Whether to show tips section on home screen */
  showTips: boolean;
}

/**
 * Notification preferences
 */
export interface NotificationPreferences {
  /** Whether to receive push notifications */
  pushEnabled: boolean;
  /** Whether to receive email notifications */
  emailEnabled: boolean;
  /** Whether to notify on document classification complete */
  onDocumentClassified: boolean;
  /** Whether to notify on document processing errors */
  onDocumentError: boolean;
}

/**
 * Display preferences
 */
export interface DisplayPreferences {
  /** Theme preference: 'light' | 'dark' | 'system' */
  theme: "light" | "dark" | "system";
  /** Compact mode for document lists */
  compactMode: boolean;
}

/**
 * Complete user preferences structure
 * This is the root preferences object stored in the database
 */
export interface UserPreferences {
  home: HomePreferences;
  notifications: NotificationPreferences;
  display: DisplayPreferences;
}

/**
 * Default preferences for new users
 */
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  home: {
    showTips: true,
  },
  notifications: {
    pushEnabled: true,
    emailEnabled: true,
    onDocumentClassified: true,
    onDocumentError: true,
  },
  display: {
    theme: "system",
    compactMode: false,
  },
};

/**
 * Utility type to get a partial update for preferences
 * Allows updating nested properties without providing the entire object
 */
export type UserPreferencesUpdate = {
  home?: Partial<HomePreferences>;
  notifications?: Partial<NotificationPreferences>;
  display?: Partial<DisplayPreferences>;
};

/**
 * Helper function to merge partial preferences with existing preferences
 * Ensures type safety when updating preferences
 */
export function mergePreferences(
  current: Partial<UserPreferences> | undefined,
  update: UserPreferencesUpdate
): UserPreferences {
  const base = current || DEFAULT_USER_PREFERENCES;

  return {
    home: {
      ...DEFAULT_USER_PREFERENCES.home,
      ...base.home,
      ...update.home,
    },
    notifications: {
      ...DEFAULT_USER_PREFERENCES.notifications,
      ...base.notifications,
      ...update.notifications,
    },
    display: {
      ...DEFAULT_USER_PREFERENCES.display,
      ...base.display,
      ...update.display,
    },
  };
}

/**
 * Helper function to get preferences with defaults
 * Use this to safely access user preferences
 */
export function getPreferencesWithDefaults(
  preferences: Partial<UserPreferences> | undefined
): UserPreferences {
  return mergePreferences(preferences, {});
}
