import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installIntersectionObserver } from '../../support/intersection-observer';
import { renderWorkspaceAt } from '../../support/render-workspace';
import { conversation, createWorkspaceApi, project, PROJECT_ID } from '../../support/workspace-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function seed(kind: 'implicit' | 'named' = 'implicit') {
  return createWorkspaceApi({
    projects: [project()],
    conversations: Array.from({ length: 27 }, (_, index) =>
      conversation({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        projectKind: kind,
        title: `Conversation ${index}`,
        createdAt: `2026-09-10T10:${String(59 - index).padStart(2, '0')}:00.000Z`,
      }),
    ),
  });
}

describe('Conversation infinite lists', () => {
  it('shows and retries a refresh error when a project previously had no conversations', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi({ projects: [project()] });
    const { queryClient } = renderWorkspaceAt(`/app/projects/${PROJECT_ID}`, api);
    await screen.findByText('Aucun chat pour le moment. Écrivez ci-dessus pour ouvrir le premier.');
    api.fail('GET /api/conversations', 503);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    const main = screen.getByRole('main');
    const alert = await within(main).findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger les chats.');
    api.recover();
    await user.click(
      within(alert).getByRole('button', { name: 'Réessayer le chargement des conversations' }),
    );
    await waitFor(() => expect(within(main).queryByRole('alert')).not.toBeInTheDocument());
  });

  it('shows a next-page skeleton, preserves rows and removes overlapping conversation IDs', async () => {
    const observer = installIntersectionObserver();
    const api = seed();
    renderWorkspaceAt('/app', api);
    const list = await screen.findByRole('group', { name: 'Chats libres' });
    await within(list).findByRole('button', { name: 'Conversation 9' });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (
        (typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
        ).includes('cursor=10')
      ) {
        requests += 1;
        await pending;
        const response = await api.fetch(input, init);
        const result = (await response.json()) as {
          data: { items: unknown[]; nextCursor: string | null };
          success: boolean;
        };
        return new Response(
          JSON.stringify({
            ...result,
            data: { ...result.data, items: [api.conversations[0], ...result.data.items] },
          }),
        );
      }
      return api.fetch(input, init);
    });
    const sentinel = within(list).getByTestId('conversation-scroll-sentinel');
    observer.intersect(sentinel);
    expect(
      await within(list).findByRole('status', { name: 'Chargement des conversations' }),
    ).toBeVisible();
    expect(within(list).getByRole('button', { name: 'Conversation 0' })).toBeVisible();
    observer.intersect(sentinel);
    expect(requests).toBe(1);
    release();
    await within(list).findByRole('button', { name: 'Conversation 19' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(20);
  });

  it('retries a failed background refresh even when the cached list has no next page', async () => {
    const user = userEvent.setup();
    installIntersectionObserver();
    const chat = conversation({ projectKind: 'implicit' });
    const api = createWorkspaceApi({ conversations: [chat], projects: [project()] });
    renderWorkspaceAt('/app', api);
    await user.click(
      await screen.findByRole('button', { name: `Actions de la conversation ${chat.title}` }),
    );
    api.fail('GET /api/conversations', 503);
    await user.click(screen.getByRole('menuitem', { name: 'Épingler la conversation' }));
    const retry = await screen.findByRole('button', {
      name: 'Réessayer le chargement des conversations',
    });
    expect(screen.getByRole('button', { name: chat.title })).toBeVisible();
    api.recover();
    await user.click(retry);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Réessayer le chargement des conversations' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('loads ten standalone chats at a time, guards duplicate notifications and stops after the last page', async () => {
    const observer = installIntersectionObserver();
    const api = seed();
    renderWorkspaceAt('/app', api);
    const list = await screen.findByRole('group', { name: 'Chats libres' });
    await within(list).findByRole('button', { name: 'Conversation 9' });
    expect(within(list).queryByRole('button', { name: 'Conversation 10' })).not.toBeInTheDocument();
    expect(api.calls).toContainEqual(
      expect.objectContaining({ path: '/api/conversations?limit=10&projectKind=implicit' }),
    );
    const sentinel = within(list).getByTestId('conversation-scroll-sentinel');
    observer.intersect(sentinel);
    observer.intersect(sentinel);
    await within(list).findByRole('button', { name: 'Conversation 19' });
    expect(api.calls.filter(({ path }) => path.includes('cursor=10'))).toHaveLength(1);
    observer.intersect(sentinel);
    await within(list).findByRole('button', { name: 'Conversation 26' });
    expect(within(list).queryByTestId('conversation-scroll-sentinel')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /Afficher plus de conversations|Charger plus de chats/u,
      }),
    ).not.toBeInTheDocument();
  });

  it('preserves loaded project chats on next-page failure and retries only after a click', async () => {
    const user = userEvent.setup();
    const observer = installIntersectionObserver();
    const api = seed('named');
    renderWorkspaceAt(`/app/projects/${PROJECT_ID}`, api);
    const list = await screen.findByRole('list', { name: 'Chats du projet' });
    await within(list).findByRole('button', { name: /^Conversation 9/u });
    api.fail('GET /api/conversations', 503);
    const main = screen.getByRole('main');
    observer.intersect(within(main).getByTestId('conversation-scroll-sentinel'));
    const error = await within(main).findByRole('alert');
    expect(within(list).getByRole('button', { name: /^Conversation 0/u })).toBeVisible();
    const failedRequests = api.calls.filter(({ path }) => path.includes('cursor=10')).length;
    expect(within(main).queryByTestId('conversation-scroll-sentinel')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(api.calls.filter(({ path }) => path.includes('cursor=10'))).toHaveLength(
        failedRequests,
      ),
    );
    api.recover();
    await user.click(
      within(error).getByRole('button', { name: 'Réessayer le chargement des conversations' }),
    );
    await within(list).findByRole('button', { name: /^Conversation 19/u });
  });

  it('pauses automatic pagination during local search, including empty results', async () => {
    installIntersectionObserver();
    const user = userEvent.setup();
    const api = seed();
    renderWorkspaceAt('/app', api);
    await screen.findByRole('button', { name: 'Conversation 9' });
    await user.type(
      screen.getByRole('searchbox', { name: 'Rechercher une conversation' }),
      'introuvable',
    );
    expect(screen.queryByTestId('conversation-scroll-sentinel')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Recherche parmi les conversations chargées. Effacez la recherche pour parcourir la suite.',
      ),
    ).toBeVisible();
    expect(api.calls.filter(({ path }) => path.includes('cursor='))).toHaveLength(0);
  });
});
