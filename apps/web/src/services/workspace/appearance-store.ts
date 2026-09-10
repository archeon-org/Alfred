import { DEFAULT_APPEARANCE, decodeAppearance } from '@/lib/workspace/appearance-preferences';
import { createLocalStorageStore } from '@/services/browser/local-storage-store';

export const APPEARANCE_STORAGE_KEY = 'alfred.appearance.v1';
export const appearanceStore = createLocalStorageStore({
  key: APPEARANCE_STORAGE_KEY,
  defaultValue: DEFAULT_APPEARANCE,
  decode: decodeAppearance,
});
