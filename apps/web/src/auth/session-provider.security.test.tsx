import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from './session-provider';
import { useSession } from './use-session';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SessionProvider security boundaries', () => {
  it('clears the in-memory session on logout without writing browser storage', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              accessToken: 'short-lived-token',
              user: {
                displayName: 'Ada Lovelace',
                email: 'ada@example.test',
                id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
                role: 'user',
              },
            },
            success: true,
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = ({ children }: PropsWithChildren) => (
      <SessionProvider>{children}</SessionProvider>
    );
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(() => result.current.logout());

    expect(result.current).toMatchObject({
      accessToken: null,
      status: 'anonymous',
      user: null,
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/auth\/logout$/u),
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    );
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it('fails closed when refresh is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    const wrapper = ({ children }: PropsWithChildren) => (
      <SessionProvider>{children}</SessionProvider>
    );
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(result.current.accessToken).toBeNull();
  });

  it('keeps the visible session when the server cannot confirm logout', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              accessToken: 'short-lived-token',
              user: {
                displayName: 'Ada Lovelace',
                email: 'ada@example.test',
                id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
                role: 'user',
              },
            },
            success: true,
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      )
      .mockRejectedValueOnce(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = ({ children }: PropsWithChildren) => (
      <SessionProvider>{children}</SessionProvider>
    );
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => {
      await expect(result.current.logout()).rejects.toThrow(/déconnexion distante/u);
    });

    expect(result.current).toMatchObject({
      accessToken: 'short-lived-token',
      status: 'authenticated',
      user: { email: 'ada@example.test' },
    });
  });

  it('rejects useSession outside its provider boundary', () => {
    expect(() => renderHook(() => useSession())).toThrow(/SessionProvider/u);
  });
});
