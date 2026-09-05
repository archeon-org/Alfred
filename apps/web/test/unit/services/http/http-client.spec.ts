import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHttpClient } from '@/services/http/http-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HTTP client', () => {
  it('refreshes once and retries a safe request with the new access token', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const refresh = vi.fn().mockResolvedValue({
      accessToken: 'new-access-token',
      user: { displayName: 'Ada', email: 'ada@example.test', id: 'user-id', role: 'user' },
    });
    const client = createHttpClient({
      getAccessToken: () => 'expired-access-token',
      refresh,
    });

    await expect(client.request('/users/me')).resolves.toMatchObject({ status: 200 });
    expect(refresh).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer expired-access-token',
    );
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer new-access-token',
    );
  });

  it('deduplicates concurrent refreshes', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const refresh = vi.fn().mockResolvedValue({
      accessToken: 'new-access-token',
      user: { displayName: 'Ada', email: 'ada@example.test', id: 'user-id', role: 'user' },
    });
    const client = createHttpClient({
      getAccessToken: () => 'expired-access-token',
      refresh,
    });

    await Promise.all([client.request('/users/me'), client.request('/users/me')]);

    expect(refresh).toHaveBeenCalledOnce();
  });

  it('does not replay a mutation unless the caller explicitly opts in', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const refresh = vi.fn();
    const client = createHttpClient({
      getAccessToken: () => 'expired-access-token',
      refresh,
    });

    await expect(client.request('/teams', { method: 'POST' })).resolves.toMatchObject({
      status: 401,
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects absolute or protocol-relative targets before attaching credentials', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const client = createHttpClient({
      getAccessToken: () => 'access-token',
      refresh: vi.fn(),
    });

    await expect(client.request('https://attacker.example' as '/users/me')).rejects.toThrow(
      /relative API path/u,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
