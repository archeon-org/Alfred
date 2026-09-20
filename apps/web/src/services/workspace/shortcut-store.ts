import {
  DEFAULT_SHORTCUT_PREFERENCES,
  decodeShortcutPreferences,
} from '@/lib/workspace/shortcut-preferences';
import { createLocalStorageStore } from '@/services/browser/local-storage-store';

export const SHORTCUT_STORAGE_KEY = 'alfred.shortcuts.v1';
export const shortcutStore = createLocalStorageStore({
  key: SHORTCUT_STORAGE_KEY,
  defaultValue: DEFAULT_SHORTCUT_PREFERENCES,
  decode: decodeShortcutPreferences,
});
