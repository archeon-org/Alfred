import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { workspaceKeys } from '@/hooks/workspace/workspace-keys';
import { SidebarFrame } from '@/components/workspace/navigation/sidebar-frame';
import { SessionContext } from '@/contexts/session/session-context';
import { authenticatedSession, createTestQueryClient } from '../../support/render-workspace';

const membership = {
  tenant: { id: '11111111-1111-4111-8111-111111111111', name: 'Organisation réelle' },
  workspaces: [
    { id: '22222222-2222-4222-8222-222222222222', name: 'Équipe produit' },
    { id: '33333333-3333-4333-8333-333333333333', name: 'Équipe recherche' },
  ],
};
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

function setup() {
  const client = createTestQueryClient();
  client.setDefaultOptions({ queries: { retry: false, refetchOnWindowFocus: false } });
  const view = (session = authenticatedSession) => (
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={session}>
        <MemoryRouter>
          <SidebarFrame />
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>
  );
  return { ...render(view()), client, view };
}

it('shows the real organisation and team while keeping personal navigation', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(membership)));
  setup();
  expect(await screen.findByText('Organisation réelle')).toBeVisible();
  expect(screen.getByText('Équipe produit')).toBeVisible();
  expect(screen.getByText('Équipe recherche')).toBeVisible();
  expect(screen.getByRole('complementary', { name: 'Espace personnel' })).toBeVisible();
});

it.each(['invalid', 'unauthorized', 'forbidden'])(
  'hides previous names after %s revalidation',
  async (failure) => {
    const fetch = vi.fn().mockResolvedValueOnce(response(membership));
    fetch.mockImplementation(() =>
      Promise.resolve(
        failure === 'invalid'
          ? response({ tenant: membership.tenant })
          : new Response(null, { status: failure === 'unauthorized' ? 401 : 403 }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const { client } = setup();
    await screen.findByText('Équipe produit');
    await act(() => client.invalidateQueries());
    expect(await screen.findByText('Organisation et équipes indisponibles')).toBeVisible();
    expect(screen.queryByText('Équipe produit')).not.toBeInTheDocument();
  },
);

it('does not reuse another account membership', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response(membership))
    .mockImplementation(() => new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetch);
  const { rerender, view } = setup();
  await screen.findByText('Équipe produit');
  rerender(
    view({ ...authenticatedSession, user: { ...authenticatedSession.user!, id: 'another-user' } }),
  );
  expect(screen.queryByText('Équipe produit')).not.toBeInTheDocument();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
});

it('keeps validated names after a temporary outage and marks them as stale', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response(membership))
    .mockImplementation(() => Promise.resolve(new Response(null, { status: 503 })));
  vi.stubGlobal('fetch', fetch);
  const { client } = setup();
  await screen.findByText('Équipe produit');
  await act(() => client.invalidateQueries());
  expect(
    await screen.findByText('Actualisation indisponible · dernières données reçues'),
  ).toBeVisible();
  expect(screen.getByText('Équipe produit')).toBeVisible();
});

it('does not refetch fresh membership on token renewal', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(response(membership)));
  vi.stubGlobal('fetch', fetch);
  const { rerender, view } = setup();
  await screen.findByText('Équipe produit');
  rerender(view({ ...authenticatedSession, accessToken: 'refreshed-memory-token' }));
  await act(async () => {});
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('shows an empty membership list without inventing an affiliation', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...membership, workspaces: [] })));
  setup();
  expect(await screen.findByText('Aucune équipe')).toBeVisible();
  expect(screen.queryByRole('list', { name: 'Équipes' })).not.toBeInTheDocument();
  expect(screen.getByText('Organisation réelle')).toBeVisible();
});

it('lets the user expand a long team list', async () => {
  const user = userEvent.setup();
  const workspaces = Array.from({ length: 8 }, (_, index) => ({
    id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
    name: `Équipe ${index + 1}`,
  }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...membership, workspaces })));
  setup();
  const summary = await screen.findByText('5 autres équipes');
  expect(screen.getByText('Équipe 8')).not.toBeVisible();
  await user.click(summary);
  expect(screen.getByText('Équipe 8')).toBeVisible();
});

it('refreshes on focus only after cached membership becomes stale', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(response(membership)));
  vi.stubGlobal('fetch', fetch);
  setup();
  await screen.findByText('Équipe produit');
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await Promise.resolve();
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now + 61_000);
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await Promise.resolve();
  });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
});

it('does not poll and reuses fresh names after remount', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(response(membership)));
  vi.stubGlobal('fetch', fetch);
  const { rerender, view } = setup();
  await screen.findByText('Équipe produit');
  rerender(<div />);
  rerender(view());
  await act(async () => {});
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.useFakeTimers();
  await act(() => vi.advanceTimersByTimeAsync(120_000));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('does not reveal rejected cached names when returning to a previous account', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response(membership))
    .mockImplementation(() => Promise.resolve(new Response(null, { status: 403 })));
  vi.stubGlobal('fetch', fetch);
  const { client, rerender, view } = setup();
  await screen.findByText('Équipe produit');
  await act(() => client.invalidateQueries());
  await screen.findByText('Organisation et équipes indisponibles');
  rerender(
    view({ ...authenticatedSession, user: { ...authenticatedSession.user!, id: 'another-user' } }),
  );
  await screen.findByText('Organisation et équipes indisponibles');
  rerender(view());
  expect(screen.queryByText('Équipe produit')).not.toBeInTheDocument();
  await screen.findByText('Organisation et équipes indisponibles');
});

it('does not revive rejected names during a later server outage', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response(membership))
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
    .mockImplementation(() => Promise.resolve(new Response(null, { status: 503 })));
  vi.stubGlobal('fetch', fetch);
  const { client } = setup();
  await screen.findByText('Équipe produit');
  await act(() => client.invalidateQueries());
  await screen.findByText('Organisation et équipes indisponibles');
  await act(() => client.invalidateQueries());
  await waitFor(() =>
    expect(
      client.getQueryState(workspaceKeys.membership(authenticatedSession.user!.id))?.error,
    ).toMatchObject({ status: 503 }),
  );
  expect(screen.queryByText('Équipe produit')).not.toBeInTheDocument();
});

it('restores names only after a valid response following an authorization rejection', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
    .mockImplementation(() => Promise.resolve(response(membership)));
  vi.stubGlobal('fetch', fetch);
  const { client } = setup();
  await screen.findByText('Organisation et équipes indisponibles');
  await act(() => client.invalidateQueries());
  expect(await screen.findByText('Équipe produit')).toBeVisible();
});
