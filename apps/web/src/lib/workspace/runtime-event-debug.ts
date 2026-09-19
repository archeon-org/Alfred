import type { RuntimeEventView } from '@/contexts/chat-session/chat-session-context';
import { canonicalAgUiEvent } from '@/lib/workspace/ag-ui-events';

interface DebugSnapshot {
  readonly events: readonly RuntimeEventView[];
  readonly error: string | null;
}

interface DebugEntry {
  readonly snapshot: DebugSnapshot;
  readonly bytes: number;
  readonly stopped?: boolean;
}

const EMPTY: DebugSnapshot = { events: [], error: null };
const MEMORY_LIMIT = 16 * 1024 * 1024;
const STORAGE_LIMIT = 4 * 1024 * 1024;
const entries = new Map<string, DebugEntry>();
const listeners = new Set<() => void>();
const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let memoryBytes = 0;

export function isRuntimeEventDebugEnabled(): boolean {
  return import.meta.env.VITE_DEBUG_EVENTS === 'true';
}

function storageKey(userId: string, conversationId: string): string {
  return `alfred:runtime-event-debug:v3:${encodeURIComponent(userId)}:${encodeURIComponent(conversationId)}`;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function reportError(key: string, error: string): void {
  const entry = entries.get(key);
  if (!entry || entry.snapshot.error === error) return;
  entries.set(key, { ...entry, snapshot: { ...entry.snapshot, error } });
  notify();
}

function isStoredEvent(value: unknown): value is RuntimeEventView {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'id' in value &&
    typeof value.id === 'number' &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    'event' in value &&
    typeof value.event === 'string' &&
    'data' in value
  );
}

/**
 * Canonical copies prevent persisted native payloads or extra private fields re-entering exports:
 * only AG-UI events of the Alfred contract, scoped to this conversation, are kept.
 */
function parsePublicEvent(value: unknown, conversationId: string): RuntimeEventView | null {
  if (!isStoredEvent(value)) return null;
  const event = canonicalAgUiEvent(value.data, { conversationId });
  if (event === null || (event.type as string) !== value.event) return null;
  return { id: value.id, event: value.event, data: event };
}

function parseSnapshot(raw: string, conversationId: string): DebugSnapshot {
  const value: unknown = JSON.parse(raw);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 3 ||
    !('events' in value) ||
    !Array.isArray(value.events) ||
    !value.events.every(isStoredEvent)
  ) {
    throw new Error('Invalid debug history');
  }
  const events = value.events.map((event: unknown) => parsePublicEvent(event, conversationId));
  if (events.some((event) => event === null)) throw new Error('Invalid public debug history');
  const publicEvents = events.filter((event): event is RuntimeEventView => event !== null);
  if (publicEvents.some((event, index) => event.id <= (publicEvents[index - 1]?.id ?? 0))) {
    throw new Error('Invalid event sequence');
  }
  return {
    events: publicEvents,
    error:
      'incomplete' in value && value.incomplete === true
        ? 'Historique de débogage incomplet : certains événements n’ont pas été sauvegardés.'
        : null,
  };
}

function getEntry(key: string, conversationId: string): DebugEntry {
  const existing = entries.get(key);
  if (existing) return existing;
  let entry: DebugEntry = { snapshot: EMPTY, bytes: 0 };
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) {
      const bytes = raw.length * 2;
      if (memoryBytes + bytes > MEMORY_LIMIT) {
        entry = {
          ...entry,
          stopped: true,
          snapshot: {
            ...EMPTY,
            error: 'Limite mémoire du débogage atteinte : historique non chargé, capture arrêtée.',
          },
        };
      } else {
        entry = { snapshot: parseSnapshot(raw, conversationId), bytes };
      }
    }
  } catch {
    entry = {
      ...entry,
      snapshot: {
        ...EMPTY,
        error: 'Historique de débogage illisible ou stockage local indisponible.',
      },
    };
  }
  entries.set(key, entry);
  memoryBytes += entry.bytes;
  return entry;
}

export function getRuntimeEventDebugSnapshot(
  userId: string,
  conversationId: string,
): DebugSnapshot {
  if (!isRuntimeEventDebugEnabled()) return EMPTY;
  return getEntry(storageKey(userId, conversationId), conversationId).snapshot;
}

/** Never let a stale successful save masquerade as a complete capture after reload. */
function invalidateStoredCapture(key: string): void {
  try {
    window.localStorage.removeItem(key);
    window.localStorage.setItem(key, JSON.stringify({ version: 3, events: [], incomplete: true }));
  } catch {
    // The caller already reports the storage failure. A denied browser store may prevent cleanup.
  }
}

function flush(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  const keys = [...pending];
  pending.clear();
  if (!isRuntimeEventDebugEnabled()) return;
  for (const key of keys) {
    const entry = entries.get(key);
    if (!entry) continue;
    try {
      const raw = JSON.stringify({
        version: 3,
        events: entry.snapshot.events,
        incomplete: entry.snapshot.error !== null,
      });
      if (raw.length * 2 > STORAGE_LIMIT) {
        invalidateStoredCapture(key);
        reportError(
          key,
          'Limite de stockage local atteinte. Les événements complets restent téléchargeables pendant cette session.',
        );
        continue;
      }
      window.localStorage.setItem(key, raw);
    } catch {
      reportError(
        key,
        'Échec du stockage local. Les événements complets restent téléchargeables pendant cette session.',
      );
    }
  }
}

function scheduleSave(key: string): void {
  pending.add(key);
  if (timer === undefined) timer = setTimeout(flush, 250);
}

export function captureRuntimeEvent(
  userId: string,
  conversationId: string,
  event: RuntimeEventView,
): void {
  if (!isRuntimeEventDebugEnabled()) return;
  const key = storageKey(userId, conversationId);
  const entry = getEntry(key, conversationId);
  if (entry.stopped) return;
  try {
    const id = (entry.snapshot.events.at(-1)?.id ?? 0) + 1;
    const captured = parsePublicEvent({ id, event: event.event, data: event.data }, conversationId);
    if (captured === null) throw new Error('Invalid public event');
    const raw = JSON.stringify(captured);
    const bytes = raw.length * 2;
    if (memoryBytes + bytes > MEMORY_LIMIT || !Number.isSafeInteger(id)) {
      entries.set(key, { ...entry, stopped: true });
      reportError(
        key,
        'Limite mémoire du débogage atteinte : capture arrêtée. Téléchargez les événements déjà capturés.',
      );
      scheduleSave(key);
      return;
    }
    entries.set(key, {
      bytes: entry.bytes + bytes,
      snapshot: { ...entry.snapshot, events: [...entry.snapshot.events, captured] },
    });
    memoryBytes += bytes;
    scheduleSave(key);
    notify();
  } catch {
    reportError(key, 'Événement public invalide : cet événement de débogage n’a pas été capturé.');
  }
}

export function subscribeRuntimeEventDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);
