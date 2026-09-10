type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Update<T> = T | ((previous: T) => T);

export interface StorageSnapshot<T> {
  readonly value: T;
  readonly storageAvailable: boolean;
}

export interface LocalStorageStore<T> {
  readonly getSnapshot: () => StorageSnapshot<T>;
  readonly getServerSnapshot: () => StorageSnapshot<T>;
  readonly subscribe: (listener: () => void) => () => void;
  readonly setValue: (update: Update<T>) => void;
  readonly reset: () => void;
}

/** One shared store per key. Storage access is lazy, injectable, and never performed by views. */
export function createLocalStorageStore<T>({
  key,
  defaultValue,
  decode,
  storage = () => window.localStorage,
}: {
  readonly key: string;
  readonly defaultValue: T;
  readonly decode: (value: unknown) => T;
  readonly storage?: () => StoragePort;
}): LocalStorageStore<T> {
  const listeners = new Set<() => void>();
  const serverSnapshot: StorageSnapshot<T> = { value: defaultValue, storageAvailable: true };
  let snapshot = serverSnapshot;
  let previousRaw: string | null | undefined;
  let volatile = false;

  function getSnapshot(): StorageSnapshot<T> {
    if (volatile) return snapshot;
    try {
      const raw = storage().getItem(key);
      if (raw !== previousRaw) {
        previousRaw = raw;
        let value = defaultValue;
        try {
          if (raw !== null) value = decode(JSON.parse(raw) as unknown);
        } catch {
          // Corrupt or obsolete preferences fall back without overwriting the stored record.
        }
        snapshot = { value, storageAvailable: true };
      }
    } catch {
      volatile = true;
      snapshot = { ...snapshot, storageAvailable: false };
    }
    return snapshot;
  }

  function publish(value: T, reset: boolean) {
    let storageAvailable = true;
    try {
      if (reset) storage().removeItem(key);
      else storage().setItem(key, JSON.stringify(value));
      previousRaw = reset ? null : JSON.stringify(value);
    } catch {
      storageAvailable = false;
    }
    volatile = !storageAvailable;
    snapshot = { value, storageAvailable };
    listeners.forEach((listener) => listener());
  }

  function onStorage(event: StorageEvent) {
    try {
      if (event.storageArea !== null && event.storageArea !== storage()) return;
    } catch {
      return;
    }
    if (event.key !== key && event.key !== null) return;
    volatile = false;
    previousRaw = undefined;
    getSnapshot();
    listeners.forEach((listener) => listener());
  }

  return {
    getSnapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener) {
      if (listeners.size === 0) window.addEventListener('storage', onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener('storage', onStorage);
      };
    },
    setValue(update) {
      const previous = getSnapshot().value;
      publish(typeof update === 'function' ? (update as (value: T) => T)(previous) : update, false);
    },
    reset: () => publish(defaultValue, true),
  };
}
