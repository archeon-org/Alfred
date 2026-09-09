import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWorkspaceAt } from '../../support/render-workspace';
import {
  conversation,
  createWorkspaceApi,
  project,
  CONVERSATION_ID,
  PROJECT_ID,
  IMPLICIT_PROJECT_ID,
} from '../../support/workspace-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function seed() {
  return createWorkspaceApi({
    projects: [
      project({ context: 'Règles du projet cible' }),
      project({ id: IMPLICIT_PROJECT_ID, kind: 'implicit', name: null }),
    ],
    conversations: [
      conversation({
        projectId: IMPLICIT_PROJECT_ID,
        projectKind: 'implicit',
        pinnedAt: '2026-09-09T11:00:00.000Z',
      }),
    ],
  });
}

async function openMove(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', {
      name: 'Actions de la conversation Synthèse du comité projet',
    }),
  );
  await user.click(screen.getByRole('menuitem', { name: 'Ajouter à un projet' }));
  return screen.getByRole('dialog', { name: 'Ajouter la conversation à un projet' });
}

describe('Moving a standalone conversation', () => {
  it.each([
    [404, 'project_not_found', 'Ce projet n’existe plus.'],
    [409, 'conversation_move_not_allowed', 'Seul un chat libre'],
  ])(
    'explains a refused move (%s/%s) and keeps the conversation unchanged',
    async (status, code, message) => {
      const user = userEvent.setup();
      const api = seed();
      api.fail(`POST /api/conversations/${CONVERSATION_ID}/move`, status, code);
      renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);
      const dialog = await openMove(user);
      await user.click(await within(dialog).findByRole('radio', { name: 'Refonte du portail' }));
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter au projet' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
      expect(api.conversations[0]?.projectId).toBe(IMPLICIT_PROJECT_ID);
    },
  );

  it('loads targets only on opening and retries a failed target list', async () => {
    const user = userEvent.setup();
    const api = seed();
    renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);
    await screen.findByRole('heading', { level: 1, name: 'Synthèse du comité projet' });
    expect(api.calls.some(({ path }) => path === '/api/projects?limit=10')).toBe(false);
    api.fail('GET /api/projects', 503);
    const dialog = await openMove(user);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Impossible de charger les projets.',
    );
    expect(within(dialog).getByRole('button', { name: 'Ajouter au projet' })).toBeDisabled();
    api.recover();
    await user.click(within(dialog).getByRole('button', { name: 'Réessayer' }));
    expect(await within(dialog).findByRole('radio', { name: 'Refonte du portail' })).toBeVisible();
  });

  it('preserves its identity, pin and draft while updating project scope and navigation', async () => {
    const user = userEvent.setup();
    const api = seed();
    const { router } = renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);
    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Brouillon conservé');
    const dialog = await openMove(user);
    await user.click(await within(dialog).findByRole('radio', { name: 'Refonte du portail' }));
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter au projet' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe(`/app/conversations/${CONVERSATION_ID}`);
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Brouillon conservé');
    expect(await screen.findByRole('link', { name: 'Refonte du portail' })).toHaveAttribute(
      'href',
      `/app/projects/${PROJECT_ID}`,
    );
    expect(
      within(screen.getByRole('group', { name: 'Chats libres' })).queryByRole('button', {
        name: /Synthèse/u,
      }),
    ).not.toBeInTheDocument();
    expect(api.conversations[0]).toMatchObject({
      id: CONVERSATION_ID,
      projectId: PROJECT_ID,
      pinnedAt: '2026-09-09T11:00:00.000Z',
    });
    expect(
      api.calls.find(({ path }) => path.endsWith('/move'))?.headers.get('idempotency-key'),
    ).toMatch(/^[0-9a-f-]{36}$/u);
    await user.click(
      screen.getByRole('button', { name: 'Actions de la conversation Synthèse du comité projet' }),
    );
    expect(screen.queryByRole('menuitem', { name: 'Ajouter à un projet' })).not.toBeInTheDocument();
  });

  it('reaches a project on a later page and retains selection on a business error', async () => {
    const user = userEvent.setup();
    const api = seed();
    api.projects.push(
      ...Array.from({ length: 12 }, (_, index) =>
        project({
          id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          name: `Projet ${index}`,
          updatedAt: '2026-09-10T12:00:00.000Z',
        }),
      ),
    );
    api.fail(
      `POST /api/conversations/${CONVERSATION_ID}/move`,
      409,
      'conversation_source_has_context',
    );
    renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);
    const dialog = await openMove(user);
    await user.click(
      await within(dialog).findByRole('button', { name: 'Charger plus de projets' }),
    );
    await user.click(await within(dialog).findByRole('radio', { name: 'Refonte du portail' }));
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter au projet' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('contient un contexte');
    expect(within(dialog).getByRole('radio', { name: 'Refonte du portail' })).toBeChecked();
    expect(api.conversations[0]?.projectKind).toBe('implicit');
    api.recover();
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter au projet' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const requests = api.calls.filter(({ path }) => path.endsWith('/move'));
    expect(requests[0]?.headers.get('idempotency-key')).toBe(
      requests[1]?.headers.get('idempotency-key'),
    );
  });
});
