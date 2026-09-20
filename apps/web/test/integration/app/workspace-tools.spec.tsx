import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextPanel } from '@/components/workspace/context/context-panel';
import { SEARCH_DEBOUNCE_MS } from '@/hooks/ui/use-debounced-search';
import { useWorkspaceTools } from '@/hooks/workspace/use-workspace-tools';
import { listAgents } from '@/services/agents/agents.service';
import { ApiRequestError } from '@/services/http/api-json';
import { installIntersectionObserver } from '../../support/intersection-observer';

const state = vi.hoisted(() => ({ teams: true }));

vi.mock('@/hooks/feature-flags/use-feature-flags-query', () => ({
  useFeatureFlagsQuery: () => ({ status: 'ready', flags: { skills: false, teams: state.teams } }),
}));
vi.mock('@/hooks/workspace/use-workspace-account', () => ({
  useWorkspaceAccount: () => ({ client: { request: vi.fn() }, userId: 'user-1' }),
}));
// The HTTP boundary has its own tests; here the real hook pages and debounces against it.
vi.mock('@/services/agents/agents.service', () => ({ listAgents: vi.fn() }));
const mockedList = vi.mocked(listAgents);
type AgentPage = Awaited<ReturnType<typeof listAgents>>;
const sentinelIn = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[aria-hidden="true"].h-px');

function deferred() {
  let resolve: (page: AgentPage) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<AgentPage>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const topology = {
  id: '98480af1-6fd5-51b1-9b43-97834987e6ea',
  graphId: 'topology',
  name: 'topology',
  shortDescription: 'AI-Ops infrastructure topology explorer.',
  description: 'Traverses nodes and relationships of the infrastructure graph.',
  tags: ['topology', 'aiops'],
};
const agent = (name: string) => ({ ...topology, id: `id-${name}`, graphId: name, name });

function ToolsPreview({ isLoading = false }: { readonly isLoading?: boolean }) {
  const tools = useWorkspaceTools();
  const [visible, setVisible] = useState(true);
  return (
    <>
      <button onClick={() => setVisible(!visible)} type="button">
        Panneau
      </button>
      {visible && <ContextPanel isLoading={isLoading} tools={tools} />}
    </>
  );
}

function renderTools(props: { readonly isLoading?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToolsPreview {...props} />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  mockedList.mockResolvedValue({ items: [], nextCursor: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockedList.mockReset();
  state.teams = true;
});

describe('Équipes tab behind the teams capability', () => {
  it('lists the sub-agents compactly and shows their details in a dialog', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue({
      items: [agent('base_react_basic'), topology],
      nextCursor: null,
    });
    renderTools();
    const list = await screen.findByRole('list', { name: 'Agents spécialistes' });
    expect(within(list).getByRole('heading', { name: 'Topology' })).toBeVisible();
    expect(within(list).getByRole('heading', { name: 'Base react basic' })).toBeVisible();
    expect(within(list).queryByText('AI-Ops infrastructure topology explorer.')).toBeNull();
    const opener = within(list).getByRole('button', { name: 'Détails de Topology' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Topology' });
    expect(dialog).toHaveTextContent('AI-Ops infrastructure topology explorer.');
    expect(dialog).toHaveTextContent(/Traverses nodes and relationships/);
    expect(within(dialog).getByRole('list', { name: 'Thèmes de Topology' })).toHaveTextContent(
      'topologyaiops',
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('sends one debounced search once typing settles and names an empty result', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    mockedList.mockImplementation((_client, _cursor, search) =>
      Promise.resolve({ items: search ? [] : [topology], nextCursor: null }),
    );
    renderTools();
    await screen.findByRole('heading', { name: 'Topology' });
    expect(mockedList).toHaveBeenCalledTimes(1);

    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un agent' }), ' absent ');
    expect(mockedList).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(await screen.findByText('Aucun agent ne correspond à « absent ».')).toBeVisible();
    expect(mockedList).toHaveBeenCalledTimes(2);
    expect(mockedList).toHaveBeenLastCalledWith(expect.anything(), undefined, 'absent');
  });

  it('loads the next page when the end of the list scrolls into view', async () => {
    const observer = installIntersectionObserver();
    mockedList.mockImplementation((_client, cursor) =>
      Promise.resolve(
        cursor === undefined
          ? { items: [agent('alpha'), agent('beta')], nextCursor: 'page-2' }
          : { items: [agent('gamma')], nextCursor: null },
      ),
    );
    const { container } = renderTools();
    const list = await screen.findByRole('list', { name: 'Agents spécialistes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);

    const sentinel = sentinelIn(container);
    expect(sentinel).not.toBeNull();
    observer.intersect(sentinel as Element);
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3));
    expect(mockedList).toHaveBeenLastCalledWith(expect.anything(), 'page-2', '');
    expect(sentinelIn(container)).toBeNull();
  });

  it('retries a failed next page without dropping the loaded agents', async () => {
    const user = userEvent.setup();
    const observer = installIntersectionObserver();
    mockedList
      .mockResolvedValueOnce({ items: [agent('alpha')], nextCursor: 'page-2' })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [agent('beta')], nextCursor: null });
    const { container } = renderTools();
    const list = await screen.findByRole('list', { name: 'Agents spécialistes' });
    observer.intersect(sentinelIn(container) as Element);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de charger la suite des agents.',
    );
    expect(within(list).getByRole('heading', { name: 'Alpha' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await within(list).findByRole('heading', { name: 'Beta' })).toBeVisible();
  });

  it('never fetches a next page while a refresh is in flight', async () => {
    const observer = installIntersectionObserver();
    mockedList.mockResolvedValueOnce({ items: [agent('old-alpha')], nextCursor: 'page-2' });
    const { container, queryClient } = renderTools();
    await screen.findByRole('heading', { name: 'Old alpha' });
    const sentinel = sentinelIn(container);
    expect(sentinel).not.toBeNull();

    const refresh = deferred();
    mockedList.mockReturnValueOnce(refresh.promise);
    act(() => {
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
    });
    observer.intersect(sentinel as Element);
    await act(async () => {
      refresh.resolve({ items: [agent('new-alpha')], nextCursor: 'page-2' });
      await refresh.promise;
    });
    expect(await screen.findByRole('heading', { name: 'New alpha' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Old alpha' })).toBeNull();
    expect(mockedList).toHaveBeenCalledTimes(2);
    expect(mockedList.mock.calls.every(([, cursor]) => cursor === undefined)).toBe(true);
  });

  it('observes the new sentinel after recovering from a failed refresh', async () => {
    const user = userEvent.setup();
    const observer = installIntersectionObserver();
    mockedList.mockResolvedValueOnce({ items: [agent('alpha')], nextCursor: 'page-2' });
    const { container, queryClient } = renderTools();
    await screen.findByRole('heading', { name: 'Alpha' });

    mockedList.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['agents'] });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les agents.');
    expect(sentinelIn(container)).toBeNull();

    mockedList
      .mockResolvedValueOnce({ items: [agent('alpha')], nextCursor: 'page-2' })
      .mockResolvedValueOnce({ items: [agent('beta')], nextCursor: null });
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await screen.findByRole('heading', { name: 'Alpha' });
    const sentinel = await waitFor(() => {
      const element = sentinelIn(container);
      expect(element).not.toBeNull();
      return element as Element;
    });
    observer.intersect(sentinel);
    expect(await screen.findByRole('heading', { name: 'Beta' })).toBeVisible();
    expect(mockedList).toHaveBeenLastCalledWith(expect.anything(), 'page-2', '');
  });

  it('restarts from the first page when the catalog changed between pages', async () => {
    const observer = installIntersectionObserver();
    mockedList
      .mockResolvedValueOnce({ items: [agent('alpha')], nextCursor: 'old-version' })
      .mockRejectedValueOnce(
        new ApiRequestError(409, 'agent_catalog_changed', 'The agent catalog changed.'),
      )
      .mockResolvedValueOnce({ items: [agent('aardvark'), agent('alpha')], nextCursor: null });
    const { container } = renderTools();
    await screen.findByRole('heading', { name: 'Alpha' });
    observer.intersect(sentinelIn(container) as Element);

    expect(await screen.findByRole('heading', { name: 'Aardvark' })).toBeVisible();
    const list = screen.getByRole('list', { name: 'Agents spécialistes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockedList.mock.calls.map(([, cursor]) => cursor)).toEqual([
      undefined,
      'old-version',
      undefined,
    ]);
  });

  it('announces loading, an empty catalog and a retryable failure', async () => {
    const user = userEvent.setup();
    let resolve: (value: Awaited<ReturnType<typeof listAgents>>) => void = () => undefined;
    mockedList.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { unmount } = renderTools();
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des agents…');
    await act(async () => {
      resolve({ items: [], nextCursor: null });
      await Promise.resolve();
    });
    expect(await screen.findByText('Aucun agent spécialiste n’est déclaré.')).toBeVisible();
    unmount();

    mockedList.mockRejectedValueOnce(new Error('offline'));
    renderTools();
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les agents.');
    mockedList.mockResolvedValueOnce({ items: [topology], nextCursor: null });
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('heading', { name: 'Topology' })).toBeVisible();
  });

  it('removes the tab entirely when the capability is off', () => {
    state.teams = false;
    renderTools();
    expect(screen.queryByRole('tab', { name: 'Équipes' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Skills' })).toHaveAttribute('aria-selected', 'true');
    // Fichiers is a capability too (`fileUploads`, off here): Skills is the only tab left, and
    // the tab list lays out one column for it.
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.getByRole('tablist')).toHaveClass('grid-cols-1');
    expect(screen.queryByRole('heading', { name: 'Agents spécialistes' })).not.toBeInTheDocument();
  });
});

describe('Workspace tools', () => {
  it('switches between teams and skills using accessible tabs', async () => {
    const user = userEvent.setup();
    renderTools();
    expect(screen.queryByRole('tab', { name: 'Contexte' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Équipes' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tablist')).toHaveClass('grid-cols-2');
    expect(screen.getByRole('heading', { name: 'Agents spécialistes' })).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Équipes' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Skills' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Le catalogue de skills est désactivé.')).toBeVisible();
  });

  it('leaves no Fichiers tab and no placeholder while fileUploads is off', () => {
    renderTools();
    expect(screen.queryByRole('tab', { name: 'Fichiers' })).not.toBeInTheDocument();
    expect(screen.queryByText(/fichiers arrivent|documents seront disponibles/iu)).toBeNull();
    expect(screen.queryByRole('button', { name: /Importer/u })).not.toBeInTheDocument();
  });

  it('replaces tool controls with loading placeholders during the preview', () => {
    renderTools({ isLoading: true });
    expect(screen.getByRole('complementary')).toBeVisible();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});
