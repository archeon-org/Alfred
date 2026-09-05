import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/contexts/session/session-provider';
import { useSession } from '@/hooks/auth/use-session';

function sessionResponse(accessToken = 'initial-token') {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        accessToken,
        user: { id: 'user-id', displayName: 'Ada', email: 'ada@example.test', role: 'user' },
      },
    }),
    { status: 200 },
  );
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const wrapper = ({ children }: PropsWithChildren) => <SessionProvider>{children}</SessionProvider>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('session mutation ordering', () => {
  it('does not refresh or restore authentication while logout is pending', async () => {
    const pendingLogout = deferredResponse();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(sessionResponse())
      .mockReturnValueOnce(pendingLogout.promise)
      .mockResolvedValueOnce(sessionResponse('unexpected-token'));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    const logout = result.current.logout();
    await act(async () => {
      await expect(result.current.refresh()).resolves.toBeNull();
    });
    pendingLogout.resolve(new Response(null, { status: 204 }));
    await act(() => logout);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('anonymous');
    expect(result.current.accessToken).toBeNull();
  });

  it('settles a prior refresh before logout and never returns its superseded token to a retry', async () => {
    const pendingRefresh = deferredResponse();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(sessionResponse())
      .mockReturnValueOnce(pendingRefresh.promise)
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    const refresh = result.current.refresh();
    const logout = result.current.logout();
    const callsBeforeRefresh = fetchMock.mock.calls.length;
    pendingRefresh.resolve(sessionResponse('superseded-token'));
    await act(async () => {
      await expect(refresh).resolves.toBeNull();
      await logout;
    });

    expect(callsBeforeRefresh).toBe(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/auth\/logout$/u),
      expect.anything(),
    );
    expect(result.current.status).toBe('anonymous');
  });

  it('deduplicates logout and allows refresh again after a failed logout', async () => {
    const pendingLogout = deferredResponse();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(sessionResponse())
      .mockReturnValueOnce(pendingLogout.promise)
      .mockResolvedValueOnce(sessionResponse('renewed-token'));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    const logout = result.current.logout();
    expect(result.current.logout()).toBe(logout);
    pendingLogout.resolve(new Response(null, { status: 503 }));
    await act(async () => {
      await expect(logout).rejects.toThrow(/déconnexion distante/u);
    });
    expect(result.current.status).toBe('authenticated');
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.accessToken).toBe('renewed-token');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
