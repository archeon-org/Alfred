import { EXECUTION_OUTPUT_MAX_LENGTH } from '@alfred/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { snapshot } from '../../../support/executions-api';
import { CONVERSATION_ID } from '../../../support/workspace-api';

const key = `alfred:runtime-event-debug:v2:user:${CONVERSATION_ID}`;
const legacyKey = `alfred:runtime-event-debug:v1:user:${CONVERSATION_ID}`;
const load = () => import('@/lib/workspace/runtime-event-debug');
const event = (text = 'public answer') => ({
  id: 1,
  event: 'snapshot',
  data: snapshot({ assistantText: text }),
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

  it('leaves legacy raw captures untouched and never reads them', async () => {
    const legacy = JSON.stringify({
      version: 1,
      events: [{ id: 1, event: 'metadata', data: { credential: 'synthetic-private' } }],
    });
    localStorage.setItem(legacyKey, legacy);
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const debug = await load();
    expect(read(debug).events).toEqual([]);
    capture(debug);
    vi.runAllTimers();
    expect(get.mock.calls.some(([requested]) => requested === legacyKey)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(localStorage.getItem(legacyKey)).toBe(legacy);
    expect(localStorage.getItem(key)).not.toContain('synthetic-private');
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
    expect(saved.events[0]?.data).toEqual(snapshot({ assistantText: 'x'.repeat(1000) }));
    expect(debug.getRuntimeEventDebugSnapshot('another-user', CONVERSATION_ID).events).toEqual([]);
    expect(debug.getRuntimeEventDebugSnapshot('user', 'another-conversation').events).toEqual([]);
    expect(listener).toHaveBeenCalled();
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

  it('rejects raw native and cross-conversation events in persisted v2 data', async () => {
    for (const invalid of [
      { id: 1, event: 'metadata', data: { secret: 'synthetic-private' } },
      {
        ...event(),
        data: snapshot({
          conversation: { ...snapshot().conversation, id: '44444444-4444-4444-8444-444444444444' },
        }),
      },
      { id: 'bad', event: 'snapshot' },
    ]) {
      vi.resetModules();
      localStorage.setItem(key, JSON.stringify({ version: 2, events: [invalid] }));
      const debug = await load();
      expect(read(debug).events).toEqual([]);
      expect(read(debug).error).toMatch(/illisible/);
    }
  });

  it('canonicalizes valid stored snapshots so unexpected private fields cannot return in downloads', async () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        events: [{ ...event(), data: { ...snapshot(), privateToken: 'synthetic-private' } }],
      }),
    );
    const debug = await load();
    expect(read(debug).events).toEqual([event('')]);
    expect(JSON.stringify(read(debug))).not.toContain('synthetic-private');
  });

  it('rejects unsupported live payloads and allows only public snapshots and conversation titles', async () => {
    const debug = await load();
    debug.captureRuntimeEvent('user', CONVERSATION_ID, {
      id: 1,
      event: 'custom',
      data: { secret: 'synthetic-private' },
    });
    expect(read(debug).events).toEqual([]);
    expect(read(debug).error).toMatch(/public invalide/);
    debug.captureRuntimeEvent('user', CONVERSATION_ID, {
      id: 1,
      event: 'conversation',
      data: snapshot().conversation,
    });
    expect(read(debug).events).toHaveLength(1);
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
    expect(read(debug).events).toMatchObject([{ data: { assistantText: 'public answer' } }]);
    expect(read(debug).error).toMatch(/stockage/);
  });

  it('flushes pending captures on pagehide', async () => {
    const debug = await load();
    capture(debug);
    window.dispatchEvent(new Event('pagehide'));
    expect(
      JSON.parse(localStorage.getItem(key) ?? '{}') as { version: number; events: unknown[] },
    ).toMatchObject({ version: 2, events: [event()] });
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

  it('handles unavailable storage and non-public values without throwing', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const debug = await load();
    expect(read(debug).error).toMatch(/indisponible/);
    expect(() =>
      debug.captureRuntimeEvent('user', CONVERSATION_ID, { id: 1, event: 'invalid', data: 1n }),
    ).not.toThrow();
    expect(read(debug).error).toMatch(/public invalide/);
  });
});
