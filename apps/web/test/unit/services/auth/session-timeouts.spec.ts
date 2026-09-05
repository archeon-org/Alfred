import { afterEach, describe, expect, it, vi } from 'vitest';

import { logoutSession, refreshSession } from '@/services/auth/auth.service';
import { coordinateSessionRefresh } from '@/services/auth/session-refresh-coordinator';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('bounded session operations', () => {
  it.each([refreshSession, logoutSession])(
    'cleans up the timer after an immediate response',
    async (operation) => {
      vi.useFakeTimers();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

      await operation();

      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([refreshSession, logoutSession])(
    'aborts a stalled $name request and clears its timer',
    async (operation) => {
      vi.useFakeTimers();
      let signal: AbortSignal | null | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>((_input, init) => {
          signal = init?.signal;
          return new Promise<Response>((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          });
        }),
      );
      let rejected = false;
      void operation().catch(() => {
        rejected = true;
      });

      await vi.advanceTimersByTimeAsync(15_000);

      expect(signal?.aborted).toBe(true);
      expect(rejected).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('cancels a stalled browser lock acquisition without invoking the refresh and permits retry', async () => {
    vi.useFakeTimers();
    const request = vi.fn<
      (
        name: string,
        options: LockOptions,
        callback: (lock: Lock | null) => Promise<null>,
      ) => Promise<null>
    >(
      (_name, options) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            {
              once: true,
            },
          );
        }),
    );
    vi.stubGlobal('navigator', { locks: { request } });
    const refresh = vi.fn().mockResolvedValue(null);
    let rejected = false;
    void coordinateSessionRefresh(refresh).catch(() => {
      rejected = true;
    });

    await vi.advanceTimersByTimeAsync(15_000);

    expect(rejected).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    request.mockImplementation((_name, _options, callback) => Promise.resolve(callback(null)));
    await expect(coordinateSessionRefresh(refresh)).resolves.toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('keeps the refresh deadline active while reading a stalled response body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((_input, init) =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                init?.signal?.addEventListener(
                  'abort',
                  () => controller.error(init.signal?.reason),
                  { once: true },
                );
              },
            }),
          ),
        ),
      ),
    );
    const result = refreshSession();
    const rejected = expect(result).rejects.toThrow(/réponse du serveur n'est pas lisible/u);

    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;

    expect(vi.getTimerCount()).toBe(0);
  });

  it('ends the acquisition timer when a lock is granted, not when its operation completes', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal('navigator', {
      locks: {
        request: (
          _name: string,
          options: LockOptions,
          callback: (lock: Lock | null) => Promise<null>,
        ) => {
          signal = options.signal;
          return callback(null);
        },
      },
    });
    let finish!: () => void;
    const operation = new Promise<null>((resolve) => {
      finish = () => resolve(null);
    });
    const request = coordinateSessionRefresh(() => operation);

    await vi.advanceTimersByTimeAsync(15_000);

    expect(signal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    finish();
    await request;
  });
});
