import { describe, expect, it, vi } from 'vitest';
import { createLocalStorageStore } from '@/services/browser/local-storage-store';

function fixture() {
  const entries = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => entries.set(key, value)),
    removeItem: vi.fn((key: string) => entries.delete(key)),
  };
  const store = createLocalStorageStore({
    key: 'test-preferences',
    defaultValue: 0,
    decode: (value: unknown) => (typeof value === 'number' ? value : 0),
    storage: () => storage,
  });
  return { entries, storage, store };
}

describe('local storage state', () => {
  it('hydrates, publishes updates and resets only its own key', () => {
    const { entries, store } = fixture();
    entries.set('test-preferences', '2');
    entries.set('unrelated', 'keep');
    const changed = vi.fn();
    const unsubscribe = store.subscribe(changed);
    expect(store.getSnapshot().value).toBe(2);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    store.setValue((value) => value + 1);
    expect(store.getSnapshot().value).toBe(3);
    expect(entries.get('test-preferences')).toBe('3');
    expect(changed).toHaveBeenCalledOnce();
    store.reset();
    expect(store.getSnapshot().value).toBe(0);
    expect(entries.get('unrelated')).toBe('keep');
    unsubscribe();
  });

  it('falls back on malformed data and validates parsed values', () => {
    const { entries, store } = fixture();
    for (const raw of ['{broken', '"wrong"', 'null']) {
      entries.set('test-preferences', raw);
      expect(store.getSnapshot().value).toBe(0);
    }
  });

  it('keeps usable volatile state when storage is blocked or full', () => {
    const { storage, store } = fixture();
    storage.setItem.mockImplementation(() => {
      throw new Error('quota');
    });
    store.setValue(4);
    expect(store.getSnapshot()).toEqual({ value: 4, storageAvailable: false });
    store.setValue((value) => value + 1);
    expect(store.getSnapshot().value).toBe(5);
    storage.removeItem.mockImplementation(() => {
      throw new Error('blocked');
    });
    store.reset();
    expect(store.getSnapshot().value).toBe(0);
  });
});

describe('storage access boundaries', () => {
  it('survives a security error while acquiring storage and can retry on the next write', () => {
    const entries = new Map<string, string>();
    const port = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
      removeItem: (key: string) => {
        entries.delete(key);
      },
    };
    const access = vi.fn(() => port);
    access.mockImplementationOnce(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    const store = createLocalStorageStore({
      key: 'visual',
      defaultValue: 'light',
      decode: (value) => (value === 'dark' ? 'dark' : 'light'),
      storage: access,
    });
    expect(store.getSnapshot()).toEqual({ value: 'light', storageAvailable: false });
    store.setValue('dark');
    expect(store.getSnapshot()).toEqual({ value: 'dark', storageAvailable: true });
    expect(entries.get('visual')).toBe('"dark"');
  });

  it('ignores unrelated keys and session-storage events', () => {
    const store = createLocalStorageStore({
      key: 'visual',
      defaultValue: 0,
      decode: (value) => (typeof value === 'number' ? value : 0),
    });
    const changed = vi.fn();
    const unsubscribe = store.subscribe(changed);
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', storageArea: localStorage }));
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'visual', storageArea: sessionStorage }),
    );
    expect(changed).not.toHaveBeenCalled();
    unsubscribe();
  });
});
