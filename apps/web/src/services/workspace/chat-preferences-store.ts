import { DEFAULT_CHAT_PREFERENCES, decodeChatPreferences } from '@/lib/workspace/chat-preferences';
import { createLocalStorageStore } from '@/services/browser/local-storage-store';

export const CHAT_PREFERENCES_STORAGE_KEY = 'alfred.chat.v1';
export const chatPreferencesStore = createLocalStorageStore({
  key: CHAT_PREFERENCES_STORAGE_KEY,
  defaultValue: DEFAULT_CHAT_PREFERENCES,
  decode: decodeChatPreferences,
});
