import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthProvidersQuery } from '@/hooks/auth/use-auth-providers-query';
import { useFeatureFlagsQuery } from '@/hooks/feature-flags/use-feature-flags-query';
import { DISABLED_FEATURE_FLAGS } from '@/services/feature-flags/feature-flags';

afterEach(() => {
  vi.unstubAllGlobals();
});

function queryWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('capability queries', () => {
  it('replaces cached enabled flags with the disabled baseline after a failed revalidation', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { ...DISABLED_FEATURE_FLAGS, teams: true } }),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { ...DISABLED_FEATURE_FLAGS, teams: true } }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(useFeatureFlagsQuery, { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.flags.teams).toBe(true));

    await act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.flags).toEqual(DISABLED_FEATURE_FLAGS);

    await act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.flags.teams).toBe(true);
  });

  it('does not expose cached login providers after a malformed revalidation', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 'google', displayName: 'Google', protocol: 'oidc' }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: [{ id: 'google' }] })),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(useAuthProvidersQuery, { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.providers).toHaveLength(1));

    await act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.providers).toEqual([]);
  });
});
