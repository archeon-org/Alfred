import { useSyncExternalStore } from 'react';
import type { LocalStorageStore } from '@/services/browser/local-storage-store';

/** Subscribe React to a shared, validated local-storage store (including other browser tabs). */
export function useLocalStorage<T>(store: LocalStorageStore<T>) {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return { ...snapshot, setValue: store.setValue, reset: store.reset };
}
