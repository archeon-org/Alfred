import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const key = 'alfred:runtime-event-debug:v1:user:conversation';
const load = () => import('@/lib/workspace/runtime-event-debug');

describe('runtime event debugging', () => {
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
  });

  it('does not read, capture or persist events when disabled', async () => {
    vi.stubEnv('VITE_DEBUG_EVENTS', 'false');
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const debug = await load();
    debug.captureRuntimeEvent('user', 'conversation', { id: 1, event: 'message', data: 'secret' });
    expect(debug.isRuntimeEventDebugEnabled()).toBe(false);
    expect(debug.getRuntimeEventDebugSnapshot('user', 'conversation').events).toEqual([]);
    vi.runAllTimers();
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('keeps full immutable snapshots, unique ids and isolated conversation histories', async () => {
    const debug = await load();
    const initial = debug.getRuntimeEventDebugSnapshot('user', 'conversation');
    const listener = vi.fn();
    const unsubscribe = debug.subscribeRuntimeEventDebug(listener);
    for (let id = 0; id < 205; id++) {
      debug.captureRuntimeEvent('user', 'conversation', {
        id: 1,
        event: 'delta',
        data: { text: 'x'.repeat(1000) },
      });
    }
    const snapshot = debug.getRuntimeEventDebugSnapshot('user', 'conversation');
    expect(initial.events).toHaveLength(0);
    expect(snapshot.events).toHaveLength(205);
    expect(new Set(snapshot.events.map((event) => event.id)).size).toBe(205);
    expect(snapshot.events[0]?.data).toEqual({ text: 'x'.repeat(1000) });
    expect(debug.getRuntimeEventDebugSnapshot('another-user', 'conversation').events).toEqual([]);
    expect(debug.getRuntimeEventDebugSnapshot('user', 'another-conversation').events).toEqual([]);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    vi.runAllTimers();
    expect(
      (JSON.parse(localStorage.getItem(key) ?? '{}') as { events: unknown[] }).events,
    ).toHaveLength(205);
    vi.resetModules();
    const restored = await load();
    restored.captureRuntimeEvent('user', 'conversation', { id: 1, event: 'done', data: null });
    expect(restored.getRuntimeEventDebugSnapshot('user', 'conversation').events.at(-1)?.id).toBe(
      206,
    );
  });

  it('reports corrupted storage and keeps new captures usable', async () => {
    localStorage.setItem(key, '{invalid');
    const debug = await load();
    expect(debug.getRuntimeEventDebugSnapshot('user', 'conversation').error).toMatch(/illisible/);
    debug.captureRuntimeEvent('user', 'conversation', { id: 0, event: 'message', data: 'new' });
    expect(debug.getRuntimeEventDebugSnapshot('user', 'conversation').events).toHaveLength(1);
  });

  it('rejects malformed event envelopes', async () => {
    localStorage.setItem(
      key,
      JSON.stringify({ version: 1, events: [{ id: 'bad', event: 'delta' }] }),
    );
    const debug = await load();
    expect(debug.getRuntimeEventDebugSnapshot('user', 'conversation').events).toEqual([]);
    expect(debug.getRuntimeEventDebugSnapshot('user', 'conversation').error).toMatch(/illisible/);
  });

  it('keeps full in-memory events when browser storage fails', async () => {
    const debug = await load();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    debug.captureRuntimeEvent('user', 'conversation', {
      id: 1,
      event: 'delta',
      data: 'full event',
    });
    expect(() => vi.runAllTimers()).not.toThrow();
    expect(debug.getRuntimeEventDebugSnapshot('user', 'conversation').events).toMatchObject([
      { data: 'full event' },
    ]);
    expect(debug.getRuntimeEventDebugSnapshot('user', 'conversation').error).toMatch(/stockage/);
  });

  it('flushes pending captures on pagehide', async () => {
    const debug = await load();
    debug.captureRuntimeEvent('user', 'conversation', { id: 1, event: 'done', data: null });
    window.dispatchEvent(new Event('pagehide'));
    expect(
      (JSON.parse(localStorage.getItem(key) ?? '{}') as { events: unknown[] }).events,
    ).toHaveLength(1);
  });

  it('reports the persistence size limit without truncating downloadable events', async () => {
    const debug = await load();
    const data = 'x'.repeat(3 * 1024 * 1024);
    debug.captureRuntimeEvent('user', 'conversation', { id: 1, event: 'large', data });
    vi.runAllTimers();
    expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({
      incomplete: true,
      events: [],
    });
    expect(debug.getRuntimeEventDebugSnapshot('user', 'conversation').events).toMatchObject([
      { data },
    ]);
    expect(debug.getRuntimeEventDebugSnapshot('user', 'conversation').error).toMatch(
      /Limite de stockage/,
    );
  });

  it('does not restore an older snapshot as complete after a storage limit failure', async () => {
    const debug = await load();
    debug.captureRuntimeEvent('user', 'conversation', { id: 1, event: 'first', data: 'saved' });
    vi.runAllTimers();
    debug.captureRuntimeEvent('user', 'conversation', {
      id: 2,
      event: 'large',
      data: 'x'.repeat(3 * 1024 * 1024),
    });
    vi.runAllTimers();
    vi.resetModules();
    const restored = await load();
    expect(restored.getRuntimeEventDebugSnapshot('user', 'conversation').error).toMatch(
      /incomplet/,
    );
    expect(restored.getRuntimeEventDebugSnapshot('user', 'conversation').events).toEqual([]);
    expect(debug.getRuntimeEventDebugSnapshot('user', 'conversation').events).toHaveLength(2);
  });

  it('stops further capture explicitly at the memory limit', async () => {
    const debug = await load();
    debug.captureRuntimeEvent('user', 'conversation', { id: 1, event: 'first', data: 'saved' });
    debug.captureRuntimeEvent('user', 'conversation', {
      id: 2,
      event: 'huge',
      data: 'x'.repeat(9 * 1024 * 1024),
    });
    debug.captureRuntimeEvent('user', 'conversation', {
      id: 3,
      event: 'later',
      data: 'also skipped',
    });
    expect(debug.getRuntimeEventDebugSnapshot('user', 'conversation').events).toMatchObject([
      { data: 'saved' },
    ]);
    expect(debug.getRuntimeEventDebugSnapshot('user', 'conversation').error).toMatch(
      /capture arrêtée/,
    );
  });

  it('handles unavailable storage and non-serializable events without throwing', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const debug = await load();
    expect(debug.getRuntimeEventDebugSnapshot('user', 'conversation').error).toMatch(
      /indisponible/,
    );
    expect(() =>
      debug.captureRuntimeEvent('user', 'conversation', { id: 1, event: 'invalid', data: 1n }),
    ).not.toThrow();
    expect(debug.getRuntimeEventDebugSnapshot('user', 'conversation').error).toMatch(
      /non sérialisable/,
    );
  });
});
