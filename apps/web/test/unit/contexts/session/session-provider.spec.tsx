import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/contexts/session/session-provider';
import { useSession } from '@/hooks/auth/use-session';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SessionProvider', () => {
  it('hydrates a session through the refresh cookie without browser token storage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            accessToken: 'short-lived-access-token',
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
    );
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = ({ children }: PropsWithChildren) => (
      <SessionProvider>{children}</SessionProvider>
    );
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.accessToken).toBe('short-lived-access-token');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/refresh$/u),
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    );
    expect(window.localStorage.length).toBe(0);
  });

  it('settles as anonymous when no valid refresh session exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const wrapper = ({ children }: PropsWithChildren) => (
      <SessionProvider>{children}</SessionProvider>
    );
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(result.current.accessToken).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('returns the refreshed session so API retries use the new token immediately', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                accessToken: 'fresh-token',
                user: {
                  displayName: 'Ada Lovelace',
                  email: 'ada@example.test',
                  id: 'user-id',
                  role: 'user',
                },
              },
              success: true,
            }),
            { headers: { 'content-type': 'application/json' }, status: 200 },
          ),
        ),
      ),
    );
    const wrapper = ({ children }: PropsWithChildren) => (
      <SessionProvider>{children}</SessionProvider>
    );
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    let refreshed: Awaited<ReturnType<typeof result.current.refresh>> = null;
    await act(async () => {
      refreshed = await result.current.refresh();
    });
    expect(refreshed).toMatchObject({ accessToken: 'fresh-token' });
  });
});
