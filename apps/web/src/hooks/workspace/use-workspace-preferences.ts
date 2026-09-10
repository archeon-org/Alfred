import { useLocalStorage } from '@/hooks/use-local-storage';
import type {
  AppearancePreferences,
  WorkspacePreferences,
} from '@/lib/workspace/workspace-preferences.types';
import { appearanceStore } from '@/services/workspace/appearance-store';

function setPreference<Key extends keyof AppearancePreferences>(
  key: Key,
  value: AppearancePreferences[Key],
) {
  appearanceStore.setValue((previous) => ({ ...previous, [key]: value }));
}

const actions = {
  setTheme: (value) => setPreference('theme', value),
  setAccent: (value) => setPreference('accent', value),
  setDensity: (value) => setPreference('density', value),
  setReadingWidth: (value) => setPreference('readingWidth', value),
  setReducedMotion: (value) => setPreference('reducedMotion', value),
  setContextOpenByDefault: (value) => setPreference('contextOpenByDefault', value),
  resetPreferences: appearanceStore.reset,
} satisfies Omit<WorkspacePreferences, keyof AppearancePreferences | 'storageAvailable'>;

export function useWorkspacePreferences(): WorkspacePreferences {
  const { value, storageAvailable } = useLocalStorage(appearanceStore);
  return { ...value, storageAvailable, ...actions };
}
