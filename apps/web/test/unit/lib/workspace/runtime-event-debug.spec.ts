import { EXECUTION_OUTPUT_MAX_LENGTH } from '@alfred/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { snapshot } from '../../../support/executions-api';
import { CONVERSATION_ID } from '../../../support/workspace-api';

const key = `alfred:runtime-event-debug:v4:user:${CONVERSATION_ID}`;
const legacyKey = `alfred:runtime-event-debug:v1:user:${CONVERSATION_ID}`;
const previousKey = `alfred:runtime-event-debug:v3:user:${CONVERSATION_ID}`;
const EXECUTION_ID = snapshot().execution.id;
const load = () => import('@/lib/workspace/runtime-event-debug');
/** One AG-UI text delta as the observer records it. */
const event = (text = 'public answer', executionId = EXECUTION_ID) => ({
  id: 1,
  executionId,
  event: 'TEXT_MESSAGE_CONTENT',
  data: { type: 'TEXT_MESSAGE_CONTENT', messageId: 'answer', delta: text },
});
/** One AG-UI state snapshot bound to a conversation. */
const stateEvent = (base = snapshot(), executionId = base.execution.id) => ({
  id: 1,
  executionId,
  event: 'STATE_SNAPSHOT',
  data: {
    type: 'STATE_SNAPSHOT',
    snapshot: {
      execution: base.execution,
      conversation: base.conversation,
      userMessage: base.userMessage,
    },
  },
});

const capture = (debug: Awaited<ReturnType<typeof load>>, text?: string) =>
  debug.captureRuntimeEvent('user', CONVERSATION_ID, event(text));
const read = (debug: Awaited<ReturnType<typeof load>>) =>
  debug.getRuntimeEventDebugSnapshot('user', CONVERSATION_ID);

describe('public runtime event debugging', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv('VITE_DEBUG_EVENTS', 'true');
    localStorage.clear();
  });
  afterEach(() => {
    window.dispatchEvent(new Event('pagehide'));
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('does not read, capture or persist events when disabled', async () => {
    vi.stubEnv('VITE_DEBUG_EVENTS', 'false');
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const debug = await load();
    capture(debug);
    expect(debug.isRuntimeEventDebugEnabled()).toBe(false);
    expect(read(debug).events).toEqual([]);
    vi.runAllTimers();
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('removes legacy and previous-version captures without reading them, and nothing else', async () => {
    const legacy = JSON.stringify({
      version: 1,
      events: [{ id: 1, event: 'metadata', data: { credential: 'synthetic-private' } }],
    });
    localStorage.setItem(legacyKey, legacy);
    localStorage.setItem(previousKey, JSON.stringify({ version: 3, events: [event()] }));
    localStorage.setItem('alfred.appearance.v1', '{"version":1}');
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const debug = await load();
    expect(read(debug).events).toEqual([]);
    // Stale copies are removed by key, never read: the module only reads its own key.
    expect(get.mock.calls.map(([requested]) => requested)).toEqual([key]);
    get.mockRestore();
    expect(localStorage.getItem(legacyKey)).toBeNull();
    expect(localStorage.getItem(previousKey)).toBeNull();
    expect(localStorage.getItem('alfred.appearance.v1')).toBe('{"version":1}');
    capture(debug);
    vi.runAllTimers();
    expect(localStorage.getItem(key)).not.toContain('synthetic-private');
  });

  it('keeps stale copies when diagnostics are disabled', async () => {
    vi.stubEnv('VITE_DEBUG_EVENTS', 'false');
    localStorage.setItem(legacyKey, '{"version":1,"events":[]}');
    const debug = await load();
    expect(read(debug).events).toEqual([]);
    expect(localStorage.getItem(legacyKey)).toBe('{"version":1,"events":[]}');
  });

  it('files events under their execution and refuses events claiming another run', async () => {
    const debug = await load();
    const other = '55555555-5555-4555-8555-555555555555';
    capture(debug, 'first answer');
    debug.captureRuntimeEvent('user', CONVERSATION_ID, event('second answer', other));
    // A run event whose AG-UI runId contradicts the execution it is filed under is dropped.
    debug.captureRuntimeEvent('user', CONVERSATION_ID, {
      id: 3,
      executionId: other,
      event: 'RUN_STARTED',
      data: { type: 'RUN_STARTED', threadId: CONVERSATION_ID, runId: EXECUTION_ID },
    });
    debug.captureRuntimeEvent('user', CONVERSATION_ID, stateEvent(snapshot(), other));
    const events = read(debug).events;
    expect(events.map((item) => [item.id, item.executionId])).toEqual([
      [1, EXECUTION_ID],
      [2, other],
    ]);
    expect(read(debug).error).toMatch(/public invalide/);
    const groups = debug.groupRuntimeEvents(events);
    expect([...groups.keys()]).toEqual([EXECUTION_ID, other]);
    expect(groups.get(other)).toMatchObject([{ data: { delta: 'second answer' } }]);
    expect(debug.groupRuntimeEvents([]).size).toBe(0);
    vi.runAllTimers();
    vi.resetModules();
    const restored = await load();
    expect(read(restored).events.map((item) => item.executionId)).toEqual([EXECUTION_ID, other]);
  });

  it('keeps immutable complete public snapshots, unique ids and separate conversation histories', async () => {
    const debug = await load();
    const initial = read(debug);
    const listener = vi.fn();
    const unsubscribe = debug.subscribeRuntimeEventDebug(listener);
    for (let id = 0; id < 205; id++) capture(debug, 'x'.repeat(1000));
    const saved = read(debug);
    expect(initial.events).toHaveLength(0);
    expect(saved.events).toHaveLength(205);
    expect(new Set(saved.events.map((item) => item.id)).size).toBe(205);
    expect(saved.events[0]?.data).toEqual(event('x'.repeat(1000)).data);
    expect(debug.getRuntimeEventDebugSnapshot('another-user', CONVERSATION_ID).events).toEqual([]);
    expect(debug.getRuntimeEventDebugSnapshot('user', 'another-conversation').events).toEqual([]);
    // Readers re-render synchronously on a store change: they follow at a bounded pace.
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    vi.runAllTimers();
    expect(
      (JSON.parse(localStorage.getItem(key) ?? '{}') as { events: unknown[] }).events,
    ).toHaveLength(205);
    vi.resetModules();
    const restored = await load();
    capture(restored);
    expect(read(restored).events.at(-1)?.id).toBe(206);
  });

  it('rejects raw native, cross-conversation and unfiled events in persisted v4 data', async () => {
    for (const invalid of [
      {
        id: 1,
        executionId: EXECUTION_ID,
        event: 'metadata',
        data: { secret: 'synthetic-private' },
      },
      stateEvent(
        snapshot({
          conversation: { ...snapshot().conversation, id: '44444444-4444-4444-8444-444444444444' },
        }),
      ),
      { id: 'bad', executionId: EXECUTION_ID, event: 'STATE_SNAPSHOT' },
      { ...event(), executionId: undefined },
      { ...event(), executionId: 'x'.repeat(65) },
      stateEvent(snapshot(), '55555555-5555-4555-8555-555555555555'),
    ]) {
      vi.resetModules();
      localStorage.setItem(key, JSON.stringify({ version: 4, events: [invalid] }));
      const debug = await load();
      expect(read(debug).events).toEqual([]);
      expect(read(debug).error).toMatch(/illisible/);
    }
  });

  it('canonicalizes valid stored snapshots so unexpected private fields cannot return in downloads', async () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 4,
        events: [{ ...event(), data: { ...event().data, privateToken: 'synthetic-private' } }],
      }),
    );
    const debug = await load();
    expect(read(debug).events).toEqual([event()]);
    expect(JSON.stringify(read(debug))).not.toContain('synthetic-private');
  });

  it('rejects unsupported live payloads and keeps only AG-UI events of this conversation', async () => {
    const debug = await load();
    debug.captureRuntimeEvent('user', CONVERSATION_ID, {
      id: 1,
      executionId: EXECUTION_ID,
      event: 'CUSTOM',
      data: { type: 'CUSTOM', name: 'PredictState', value: { secret: 'synthetic-private' } },
    });
    expect(read(debug).events).toEqual([]);
    expect(read(debug).error).toMatch(/public invalide/);
    debug.captureRuntimeEvent('user', CONVERSATION_ID, stateEvent());
    expect(read(debug).events).toEqual([stateEvent()]);
    expect(JSON.stringify(read(debug))).not.toContain('synthetic-private');
  });

  it('reports corrupted storage and keeps new captures usable', async () => {
    localStorage.setItem(key, '{invalid');
    const debug = await load();
    expect(read(debug).error).toMatch(/illisible/);
    capture(debug);
    expect(read(debug).events).toHaveLength(1);
  });

  it('keeps complete in-memory events when browser storage fails', async () => {
    const debug = await load();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    capture(debug);
    expect(() => vi.runAllTimers()).not.toThrow();
    expect(read(debug).events).toMatchObject([{ data: { delta: 'public answer' } }]);
    expect(read(debug).error).toMatch(/stockage/);
  });

  it('flushes pending captures on pagehide', async () => {
    const debug = await load();
    capture(debug);
    window.dispatchEvent(new Event('pagehide'));
    expect(
      JSON.parse(localStorage.getItem(key) ?? '{}') as { version: number; events: unknown[] },
    ).toMatchObject({ version: 4, events: [event()] });
  });

  it('reports the storage size limit without truncating downloadable events', async () => {
    const debug = await load();
    for (let id = 0; id < 10; id++) capture(debug, 'x'.repeat(EXECUTION_OUTPUT_MAX_LENGTH));
    vi.runAllTimers();
    expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({
      incomplete: true,
      events: [],
    });
    expect(read(debug).events).toHaveLength(10);
    expect(read(debug).error).toMatch(/Limite de stockage/);
  });

  it('does not restore a stale snapshot as complete after a storage limit failure', async () => {
    const debug = await load();
    capture(debug, 'saved');
    vi.runAllTimers();
    for (let id = 0; id < 10; id++) capture(debug, 'x'.repeat(EXECUTION_OUTPUT_MAX_LENGTH));
    vi.runAllTimers();
    vi.resetModules();
    const restored = await load();
    expect(read(restored).error).toMatch(/incomplet/);
    expect(read(restored).events).toEqual([]);
    expect(read(debug).events).toHaveLength(11);
  });

  it('stops further capture explicitly at the aggregate memory limit', async () => {
    const debug = await load();
    for (let id = 0; id < 40; id++) capture(debug, 'x'.repeat(EXECUTION_OUTPUT_MAX_LENGTH));
    const count = read(debug).events.length;
    capture(debug, 'also skipped');
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(40);
    expect(read(debug).events).toHaveLength(count);
    expect(read(debug).error).toMatch(/capture arrêtée/);
  });

  it('reports a browser fault once, by error type only, without marking the capture incomplete', async () => {
    const debug = await load();
    capture(debug);
    const listener = vi.fn();
    debug.subscribeRuntimeEventDebug(listener);
    const fault = new TypeError(
      'Cannot read properties of undefined (reading "synthetic-private")',
    );
    debug.reportRuntimeEventFault('user', CONVERSATION_ID, fault);
    debug.reportRuntimeEventFault('user', CONVERSATION_ID, fault);
    expect(listener).toHaveBeenCalledOnce();
    expect(read(debug).error).toMatch(/\(TypeError\)/);
    expect(read(debug).error).not.toContain('synthetic-private');
    vi.runAllTimers();
    expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({
      incomplete: false,
      events: [event()],
    });
    const renamed = Object.assign(new Error('boom'), { name: 'not a <name>' });
    debug.reportRuntimeEventFault('user', 'another-conversation', renamed);
    expect(debug.getRuntimeEventDebugSnapshot('user', 'another-conversation').error).toMatch(
      /\(Error\)/,
    );
  });

  it('keeps an earlier capture error shown and ignores faults while disabled', async () => {
    localStorage.setItem(key, '{invalid');
    const debug = await load();
    debug.reportRuntimeEventFault('user', CONVERSATION_ID, new TypeError('x'));
    expect(read(debug).error).toMatch(/illisible/);
    vi.stubEnv('VITE_DEBUG_EVENTS', 'false');
    vi.resetModules();
    const disabled = await load();
    const get = vi.spyOn(Storage.prototype, 'getItem');
    disabled.reportRuntimeEventFault('user', CONVERSATION_ID, new TypeError('x'));
    expect(get).not.toHaveBeenCalled();
  });

  it('handles unavailable storage and non-public values without throwing', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const debug = await load();
    expect(read(debug).error).toMatch(/indisponible/);
    expect(() =>
      debug.captureRuntimeEvent('user', CONVERSATION_ID, {
        id: 1,
        executionId: EXECUTION_ID,
        event: 'invalid',
        data: 1n,
      }),
    ).not.toThrow();
    expect(read(debug).error).toMatch(/public invalide/);
  });
});
