import { useLocalStorage } from '@/hooks/use-local-storage';
import {
  applyPreset,
  withSwitch,
  type ChatDisplayKey,
  type ChatPreferences,
  type ChatPreset,
} from '@/lib/workspace/chat-preferences';
import { chatPreferencesStore } from '@/services/workspace/chat-preferences-store';

export interface ChatPreferencesState extends ChatPreferences {
  readonly storageAvailable: boolean;
  /** Sets every switch of the preset. */
  readonly applyPreset: (preset: ChatPreset) => void;
  /** Keeps the current switches under the custom detail. */
  readonly keepCustom: () => void;
  /** Changes one switch; the detail follows the combination it now forms. */
  readonly setSwitch: (key: ChatDisplayKey, value: boolean) => void;
  readonly reset: () => void;
}

const actions = {
  applyPreset: (preset: ChatPreset) => chatPreferencesStore.setValue(applyPreset(preset)),
  keepCustom: () =>
    chatPreferencesStore.setValue((previous) => ({ ...previous, detail: 'custom' })),
  setSwitch: (key: ChatDisplayKey, value: boolean) =>
    chatPreferencesStore.setValue((previous) => withSwitch(previous, key, value)),
  reset: chatPreferencesStore.reset,
};

/** Display choices for the chat, saved in this browser and shared by every open tab. */
export function useChatPreferences(): ChatPreferencesState {
  const { value, storageAvailable } = useLocalStorage(chatPreferencesStore);
  return { ...value, storageAvailable, ...actions };
}
