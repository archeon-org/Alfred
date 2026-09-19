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
  /** The error reports a browser fault, not a gap in the capture. */
  readonly fault?: string;
}

const EMPTY: DebugSnapshot = { events: [], error: null };
const MEMORY_LIMIT = 16 * 1024 * 1024;
const STORAGE_LIMIT = 4 * 1024 * 1024;
const entries = new Map<string, DebugEntry>();
const listeners = new Set<() => void>();
const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let memoryBytes = 0;
let cancelNotify: (() => void) | null = null;

export function isRuntimeEventDebugEnabled(): boolean {
  return import.meta.env.VITE_DEBUG_EVENTS === 'true';
}

const STORAGE_VERSION = 4;
const EXECUTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/u;

const LEGACY_KEY = /^alfred:runtime-event-debug:v[123]:/u;
let legacySwept = false;

function storageKey(userId: string, conversationId: string): string {
  return `alfred:runtime-event-debug:v${STORAGE_VERSION}:${encodeURIComponent(userId)}:${encodeURIComponent(conversationId)}`;
}

/**
 * Earlier capture formats are never read; they may hold conversation content, so the first use of
 * diagnostics in a page removes them. Nothing else in storage is touched.
 */
function sweepLegacyCaptures(): void {
  if (legacySwept) return;
  legacySwept = true;
  try {
    const stale: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key !== null && LEGACY_KEY.test(key)) stale.push(key);
    }
    for (const key of stale) window.localStorage.removeItem(key);
  } catch {
    // A denied store simply keeps its stale copies; the caller reports storage state separately.
  }
}

function notify(): void {
  cancelNotify?.();
  cancelNotify = null;
  for (const listener of listeners) listener();
}

/** Longest delay before the views that list captured events see a new one. */
const NOTIFY_INTERVAL_MS = 1_000;

/**
 * Captures arrive once per event, and a store change re-renders its readers synchronously, the
 * whole transcript included: the views that list captured events follow once per second, and
 * immediately for an error.
 */
function scheduleNotify(): void {
  if (cancelNotify !== null) return;
  const handle = setTimeout(notify, NOTIFY_INTERVAL_MS);
  cancelNotify = () => clearTimeout(handle);
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
    'executionId' in value &&
    typeof value.executionId === 'string' &&
    EXECUTION_ID_PATTERN.test(value.executionId) &&
    'event' in value &&
    typeof value.event === 'string' &&
    'data' in value
  );
}

/**
 * Canonical copies prevent persisted native payloads or extra private fields re-entering exports:
 * only AG-UI events of the Alfred contract, scoped to this conversation and to the execution they
 * are filed under, are kept.
 */
function parsePublicEvent(value: unknown, conversationId: string): RuntimeEventView | null {
  if (!isStoredEvent(value)) return null;
  const event = canonicalAgUiEvent(value.data, { conversationId, executionId: value.executionId });
  if (event === null || (event.type as string) !== value.event) return null;
  return { id: value.id, executionId: value.executionId, event: value.event, data: event };
}

/** Events of one conversation filed by execution, in capture order; stable for identical input. */
export function groupRuntimeEvents(
  events: readonly RuntimeEventView[],
): ReadonlyMap<string, readonly RuntimeEventView[]> {
  const groups = new Map<string, RuntimeEventView[]>();
  for (const event of events) {
    const group = groups.get(event.executionId);
    if (group === undefined) groups.set(event.executionId, [event]);
    else group.push(event);
  }
  return groups;
}

function parseSnapshot(raw: string, conversationId: string): DebugSnapshot {
  const value: unknown = JSON.parse(raw);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== STORAGE_VERSION ||
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
  sweepLegacyCaptures();
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
    window.localStorage.setItem(
      key,
      JSON.stringify({ version: STORAGE_VERSION, events: [], incomplete: true }),
    );
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
        version: STORAGE_VERSION,
        events: entry.snapshot.events,
        incomplete: entry.snapshot.error !== null && entry.snapshot.error !== entry.fault,
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
    const captured = parsePublicEvent(
      { id, executionId: event.executionId, event: event.event, data: event.data },
      conversationId,
    );
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
    scheduleNotify();
  } catch {
    reportError(key, 'Événement public invalide : cet événement de débogage n’a pas été capturé.');
  }
}

const FAULT_NAME = /^[A-Za-z][A-Za-z0-9]{0,39}$/u;

/**
 * Records once, in the capture of the conversation, that the browser failed while applying one
 * of its public events. Only the error's type is kept: its message may quote content. An earlier
 * capture error stays shown.
 */
export function reportRuntimeEventFault(
  userId: string,
  conversationId: string,
  error: Error,
): void {
  if (!isRuntimeEventDebugEnabled()) return;
  const key = storageKey(userId, conversationId);
  const entry = getEntry(key, conversationId);
  if (entry.snapshot.error !== null) return;
  const name = FAULT_NAME.test(error.name) ? error.name : 'Error';
  const fault = `Erreur du navigateur en appliquant un événement (${name}) : l’observation reprend depuis l’état enregistré.`;
  entries.set(key, { ...entry, fault, snapshot: { ...entry.snapshot, error: fault } });
  notify();
}

export function subscribeRuntimeEventDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);
