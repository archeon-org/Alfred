import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('session refresh coordination', () => {
  it('serializes refresh rotation across independent browser contexts', async () => {
    let queue = Promise.resolve();
    const request = vi.fn(
      <T>(_name: string, _options: LockOptions, callback: (lock: Lock) => Promise<T>) => {
        const result = queue.then(() =>
          callback({ mode: 'exclusive', name: 'alfred.auth.refresh-session.v1' }),
        );
        queue = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    );
    vi.stubGlobal('navigator', { locks: { request } });

    const firstContext = await import('./session-refresh-coordinator');
    vi.resetModules();
    const secondContext = await import('./session-refresh-coordinator');
    let active = 0;
    let maximumActive = 0;
    const rotate = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return null;
    });

    await Promise.all([
      firstContext.coordinateSessionRefresh(rotate),
      secondContext.coordinateSessionRefresh(rotate),
    ]);

    expect(rotate).toHaveBeenCalledTimes(2);
    expect(maximumActive).toBe(1);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
