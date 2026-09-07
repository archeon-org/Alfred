import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { concat, firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdempotencyInterceptor } from '@api/common/idempotency/idempotency.interceptor';
import { IDEMPOTENT_KEY } from '@api/common/idempotency/idempotent.decorator';
import type { IdempotencyStore } from '@api/common/idempotency/idempotency.store';

function fixture(
  options: { key?: unknown; user?: string | null; decorated?: boolean; path?: string } = {},
) {
  const store = {
    reserve: vi.fn<IdempotencyStore['reserve']>().mockResolvedValue(true),
    find: vi.fn<IdempotencyStore['find']>(),
    complete: vi.fn<IdempotencyStore['complete']>().mockResolvedValue(undefined),
  };
  const reflector = new Reflector();
  const handler = () => undefined;
  if (options.decorated !== false) Reflect.defineMetadata(IDEMPOTENT_KEY, true, handler);
  const request = {
    method: 'POST',
    originalUrl: options.path ?? '/api/fixture',
    headers: { 'idempotency-key': options.key === undefined ? 'key_1' : options.key },
    body: { b: 2, a: 1 },
    user: options.user === null ? undefined : { id: options.user ?? 'user-1' },
  };
  const response = { statusCode: 201, status: vi.fn(), getHeader: vi.fn() };
  const context = {
    getHandler: () => handler,
    getClass: () => class Fixture {},
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  const next = { handle: vi.fn(() => of({ id: 'created' })) } satisfies CallHandler;
  const interceptor = new IdempotencyInterceptor(reflector, store as unknown as IdempotencyStore);
  const run = () => firstValueFrom(interceptor.intercept(context, next));
  return { store, request, response, context, next, run };
}

afterEach(() => vi.useRealTimers());

describe('IdempotencyInterceptor', () => {
  it('passes through undecorated handlers and missing keys without storage', async () => {
    for (const options of [{ decorated: false }, { key: null }]) {
      const f = fixture(options);
      if (options.key === null)
        delete (f.request.headers as Record<string, unknown>)['idempotency-key'];
      await expect(f.run()).resolves.toEqual({ id: 'created' });
      expect(f.store.reserve).not.toHaveBeenCalled();
    }
  });

  it.each(['', 'a'.repeat(129), 'with space', 'é', ['first', 'second']])(
    'rejects invalid key %s before handler',
    async (key) => {
      const f = fixture({ key });
      await expect(f.run()).rejects.toMatchObject({ code: 'invalid_idempotency_key' });
      expect(f.next.handle).not.toHaveBeenCalled();
    },
  );

  it('requires an authenticated owner even on a misconfigured fixture', async () => {
    const f = fixture({ user: null });
    await expect(f.run()).rejects.toMatchObject({ status: 401 });
    expect(f.store.reserve).not.toHaveBeenCalled();
  });

  it('reserves before executing and stores only status/body', async () => {
    const f = fixture();
    f.store.reserve.mockImplementation(() => {
      expect(f.next.handle).not.toHaveBeenCalled();
      return Promise.resolve(true);
    });
    await expect(f.run()).resolves.toEqual({ id: 'created' });
    expect(f.store.reserve).toHaveBeenCalledWith(
      'user-1',
      'key_1',
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      expect.any(String),
    );
    expect(f.store.complete).toHaveBeenCalledWith(
      'user-1',
      'key_1',
      expect.any(String),
      201,
      {
        id: 'created',
      },
      f.store.reserve.mock.calls[0]?.[3],
    );
  });

  it('canonicalizes nested object order but includes method, URL and array order', async () => {
    const hash = async (body: unknown, method = 'POST', url = '/api/fixture') => {
      const f = fixture();
      Object.assign(f.request, { body, method, originalUrl: url });
      await f.run();
      return f.store.reserve.mock.calls[0]?.[2];
    };
    const first = await hash({ b: [{ z: 2, a: 1 }], a: 0 });
    expect(await hash({ a: 0, b: [{ a: 1, z: 2 }] })).toBe(first);

    expect(await hash({ a: 0, b: [{ a: 1, z: 2 }] }, 'POST', '/api/other')).not.toBe(first);
    expect(await hash([1, 2])).not.toBe(await hash([2, 1]));
    expect(await hash({}, 'POST', '/api/fixture?a=1')).not.toBe(
      await hash({}, 'POST', '/api/fixture?a=2'),
    );
  });

  it('replays completed responses without running handler', async () => {
    const f = fixture();
    f.store.reserve.mockResolvedValue(false);
    f.store.find.mockImplementation(() =>
      Promise.resolve({
        requestHash: f.store.reserve.mock.calls[0]?.[2] ?? '',
        responseStatus: 202,
        responseBody: { saved: true },
      }),
    );
    await expect(f.run()).resolves.toEqual({ saved: true });
    expect(f.response.status).toHaveBeenCalledWith(202);
    expect(f.next.handle).not.toHaveBeenCalled();
    expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('rejects a mismatch even when the reservation is pending', async () => {
    const f = fixture();
    f.store.reserve.mockResolvedValue(false);
    f.store.find.mockResolvedValue({
      requestHash: 'different',
      responseStatus: null,
      responseBody: null,
    });
    await expect(f.run()).rejects.toMatchObject({ code: 'idempotency_mismatch', status: 422 });
    expect(f.next.handle).not.toHaveBeenCalled();
  });

  it('polls a contender and replays when the winner completes', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.store.reserve.mockResolvedValue(false);
    f.store.find.mockImplementation(() =>
      Promise.resolve({
        requestHash: f.store.reserve.mock.calls[0]?.[2] ?? '',
        responseStatus: f.store.find.mock.calls.length > 1 ? 201 : null,
        responseBody: { saved: true },
      }),
    );
    const result = f.run();
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toEqual({ saved: true });
    expect(f.next.handle).not.toHaveBeenCalled();
  });

  it.each(['pending', 'missing', 'slow-reserve', 'slow-read'])(
    'bounds %s to two seconds and never executes late',
    async (kind) => {
      vi.useFakeTimers();
      const f = fixture();
      f.store.reserve.mockResolvedValue(false);
      f.store.find.mockImplementation(() =>
        Promise.resolve(
          kind === 'missing'
            ? null
            : {
                requestHash: f.store.reserve.mock.calls[0]?.[2] ?? '',
                responseStatus: null,
                responseBody: null,
              },
        ),
      );
      let finish: ((value: boolean) => void) | undefined;
      if (kind === 'slow-reserve')
        f.store.reserve.mockImplementation(
          () =>
            new Promise<boolean>((resolve) => {
              finish = resolve;
            }),
        );
      if (kind === 'slow-read') f.store.find.mockImplementation(() => new Promise(() => undefined));
      const result = expect(f.run()).rejects.toMatchObject({
        code: 'idempotency_in_progress',
        status: 409,
      });
      await vi.advanceTimersByTimeAsync(2_000);
      await result;
      finish?.(true);
      await vi.advanceTimersByTimeAsync(100);
      expect(f.next.handle).not.toHaveBeenCalled();
    },
  );

  it('never releases a reservation on handler or response-storage failure', async () => {
    const f = fixture();
    f.next.handle.mockReturnValue(throwError(() => new Error('handler failed after committing')));
    await expect(f.run()).rejects.toThrow('handler failed');
    expect(f.store.complete).not.toHaveBeenCalled();
    const g = fixture();
    g.store.complete.mockRejectedValue(new Error('storage unavailable'));
    await expect(g.run()).rejects.toThrow('storage unavailable');
    expect(g.next.handle).toHaveBeenCalledOnce();
  });

  it('never stores non-2xx responses', async () => {
    const f = fixture();
    f.response.statusCode = 409;
    await f.run();
    expect(f.store.complete).not.toHaveBeenCalled();
  });

  it('rejects public/auth handlers, non-POST methods and cookie-setting responses', async () => {
    const f = fixture({ path: '/api/auth/refresh' });
    await expect(f.run()).rejects.toThrow();
    expect(f.next.handle).not.toHaveBeenCalled();
    const g = fixture();
    g.request.method = 'GET';
    await expect(g.run()).rejects.toMatchObject({ status: 400 });
    expect(g.store.reserve).not.toHaveBeenCalled();
    const h = fixture();
    h.response.getHeader.mockReturnValue('session=secret');
    await expect(h.run()).rejects.toThrow();
    expect(h.store.complete).not.toHaveBeenCalled();
  });

  it('allows legitimate product fields named token under the explicit non-secret contract', async () => {
    const f = fixture();
    f.next.handle.mockReturnValue(of({ token: 'a parser token' } as unknown as { id: string }));
    await expect(f.run()).resolves.toEqual({ token: 'a parser token' });
    expect(f.store.complete).toHaveBeenCalledOnce();
  });

  it('does not store a partial emission if the handler subsequently fails', async () => {
    const f = fixture();
    f.next.handle.mockReturnValue(
      concat(
        of({ id: 'partial' }),
        throwError(() => new Error('late failure')),
      ),
    );
    await expect(f.run()).rejects.toThrow('late failure');
    expect(f.store.complete).not.toHaveBeenCalled();
  });
});
