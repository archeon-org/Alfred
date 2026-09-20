import { useMemo } from 'react';

import { useLocalStorage } from '@/hooks/use-local-storage';
import {
  isApplePlatform,
  resolveBindings,
  shortcutAttributes,
  type ShortcutAction,
  type ShortcutBinding,
  type ShortcutBindings,
  type ShortcutOverrides,
} from '@/lib/workspace/keyboard-shortcuts';
import { shortcutStore } from '@/services/workspace/shortcut-store';

export interface ShortcutPreferencesState {
  readonly apple: boolean;
  readonly bindings: ShortcutBindings;
  readonly overrides: ShortcutOverrides;
  readonly storageAvailable: boolean;
  readonly setBinding: (action: ShortcutAction, binding: ShortcutBinding) => void;
  readonly resetBinding: (action: ShortcutAction) => void;
  readonly resetAll: () => void;
}

const actions = {
  setBinding: (action: ShortcutAction, binding: ShortcutBinding) =>
    shortcutStore.setValue((previous) => ({
      version: 1,
      bindings: { ...previous.bindings, [action]: binding },
    })),
  resetBinding: (action: ShortcutAction) =>
    shortcutStore.setValue((previous) => {
      const { [action]: _removed, ...bindings } = previous.bindings;
      void _removed;
      return { version: 1, bindings };
    }),
  resetAll: shortcutStore.reset,
};

/** The person's shortcut bindings, shared by every consumer and persisted in this browser. */
export function useShortcutPreferences(): ShortcutPreferencesState {
  const { value, storageAvailable } = useLocalStorage(shortcutStore);
  const apple = useMemo(() => isApplePlatform(), []);
  const bindings = useMemo(() => resolveBindings(value.bindings), [value.bindings]);
  return { apple, bindings, overrides: value.bindings, storageAvailable, ...actions };
}

/** Attributes for a control that also answers to a shortcut, following the current bindings. */
export function useShortcutHint(
  action: ShortcutAction,
  label: string,
): { readonly 'aria-keyshortcuts': string; readonly title: string } {
  const { apple, bindings } = useShortcutPreferences();
  return shortcutAttributes(bindings[action], label, apple);
}
