import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWorkspaceAt } from '../../support/render-workspace';
import {
  CONVERSATION_ID,
  conversation,
  createWorkspaceApi,
  PROJECT_ID,
  project,
} from '../../support/workspace-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sidebar = () => screen.getByRole('complementary', { name: 'Espace personnel' });
const projectRow = (name: string) =>
  within(screen.getByRole('group', { name })).getByRole('button', { name });

function fiveProjects() {
  return ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq'].map((name, index) =>
    project({
      id: `0b6e1a9e-0a7f-4c26-9f5b-2f1a2c3d4e${String(index).padStart(2, '0')}`,
      name,
      updatedAt: `2026-09-0${9 - index}T10:00:00.000Z`,
    }),
  );
}

describe('Workspace navigation', () => {
  it('returns to the project home from one of its chats through the sidebar row and the header link', async () => {
    const user = userEvent.setup();
    const { router } = renderWorkspaceAt(
      `/app/conversations/${CONVERSATION_ID}`,
      createWorkspaceApi({ conversations: [conversation()], projects: [project()] }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Synthèse du comité projet' }),
    ).toBeVisible();
    const headerLink = await screen.findByRole('link', { name: 'Refonte du portail' });
    expect(headerLink).toHaveAttribute('href', `/app/projects/${PROJECT_ID}`);
    const row = projectRow('Refonte du portail');
    expect(row).toHaveAttribute('aria-current', 'true');
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(sidebar()).getByRole('button', { name: 'Synthèse du comité projet' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: /^Réduire|Déplier/u })).not.toBeInTheDocument();

    await user.click(row);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Refonte du portail' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe(`/app/projects/${PROJECT_ID}`);

    await user.click(projectRow('Refonte du portail'));
    expect(projectRow('Refonte du portail')).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(sidebar()).queryByRole('button', { name: 'Synthèse du comité projet' }),
    ).not.toBeInTheDocument();
    await user.click(projectRow('Refonte du portail'));
    expect(projectRow('Refonte du portail')).toHaveAttribute('aria-expanded', 'true');
    expect(router.state.location.pathname).toBe(`/app/projects/${PROJECT_ID}`);

    await user.click(within(sidebar()).getByRole('button', { name: 'Synthèse du comité projet' }));
    await user.click(headerLink);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/app/projects/${PROJECT_ID}`));
  });

  it('pins, unpins and reaches the project home from the row menu', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi({ projects: [project()] });
    const { router } = renderWorkspaceAt('/app', api);
    const openRowMenu = async () =>
      user.click(
        await within(sidebar()).findByRole('button', {
          name: 'Actions du projet Refonte du portail',
        }),
      );

    await openRowMenu();
    expect(
      screen.getByRole('menu', { name: 'Actions du projet Refonte du portail' }),
    ).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Épingler le projet' }));

    const pinned = await screen.findByRole('region', { name: 'Épinglés' });
    expect(within(pinned).getByRole('group', { name: 'Refonte du portail' })).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Projets' })).getByText(
        'Tous vos projets sont épinglés.',
      ),
    ).toBeVisible();
    expect(api.calls).toContainEqual(
      expect.objectContaining({ method: 'POST', path: `/api/projects/${PROJECT_ID}/pin` }),
    );

    await openRowMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Désépingler le projet' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Épinglés' })).not.toBeInTheDocument(),
    );

    await openRowMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Accueil du projet' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Refonte du portail' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe(`/app/projects/${PROJECT_ID}`);
  });

  it('renames and deletes the current project from the row menu and leaves its page', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi({ conversations: [conversation()], projects: [project()] });
    const { router } = renderWorkspaceAt(`/app/projects/${PROJECT_ID}`, api);
    const openRowMenu = async () =>
      user.click(await within(sidebar()).findByRole('button', { name: /^Actions du projet/u }));

    await openRowMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Renommer le projet' }));
    const rename = screen.getByRole('dialog', { name: 'Renommer le projet' });
    await user.clear(within(rename).getByRole('textbox', { name: 'Nom du projet' }));
    await user.type(within(rename).getByRole('textbox', { name: 'Nom du projet' }), 'Portail v2');
    await user.click(within(rename).getByRole('button', { name: 'Renommer' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Portail v2' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Portail v2' })).toBeVisible();

    await openRowMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Supprimer le projet' }));
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Supprimer ce projet ?' })).getByRole(
        'button',
        {
          name: 'Supprimer le projet',
        },
      ),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nouvelle conversation' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/app');
    expect(api.calls).toContainEqual(
      expect.objectContaining({ method: 'DELETE', path: `/api/projects/${PROJECT_ID}` }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Portail v2' })).not.toBeInTheDocument(),
    );
  });

  it('keeps the project of an older chat opened by link and loads older chats on demand', async () => {
    const user = userEvent.setup();
    const oldChatId = '3f2e1d0c-9b8a-4765-8321-000000000001';
    const recentStandalone = Array.from({ length: 50 }, (_, index) =>
      conversation({
        createdAt: `2026-09-08T${String(10 + Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00.000Z`,
        id: `7a6b5c4d-3e2f-4a1b-9c8d-${String(index).padStart(12, '0')}`,
        projectId: `9e8d7c6b-5a4f-4e3d-8c2b-${String(index).padStart(12, '0')}`,
        projectKind: 'implicit',
        title: `Chat libre ${index}`,
      }),
    );
    const api = createWorkspaceApi({
      conversations: [
        ...recentStandalone,
        conversation({ createdAt: '2026-09-01T09:00:00.000Z', id: oldChatId, title: 'Vieux chat' }),
      ],
      projects: [project()],
    });
    renderWorkspaceAt(`/app/conversations/${oldChatId}`, api);

    expect(await screen.findByRole('heading', { level: 1, name: 'Vieux chat' })).toBeVisible();
    expect(await screen.findByRole('link', { name: 'Refonte du portail' })).toHaveAttribute(
      'href',
      `/app/projects/${PROJECT_ID}`,
    );
    expect(projectRow('Refonte du portail')).toHaveAttribute('aria-current', 'true');
    expect(within(sidebar()).queryByRole('button', { name: 'Vieux chat' })).not.toBeInTheDocument();
    expect(api.calls).toContainEqual(
      expect.objectContaining({ method: 'GET', path: `/api/conversations/${oldChatId}` }),
    );

    await user.click(screen.getByRole('button', { name: 'Nouvelle conversation' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouvelle conversation' });
    expect(within(dialog).getByText(/Refonte du portail/u)).toBeVisible();
    await user.keyboard('{Escape}');

    await user.click(
      within(sidebar()).getByRole('button', { name: 'Afficher plus de conversations' }),
    );

    const oldRow = await within(
      screen.getByRole('group', { name: 'Refonte du portail' }),
    ).findByRole('button', { name: 'Vieux chat' });
    expect(oldRow).toHaveAttribute('aria-current', 'page');
    expect(
      within(sidebar()).queryByRole('button', { name: 'Afficher plus de conversations' }),
    ).not.toBeInTheDocument();
    expect(api.calls.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        '/api/conversations?limit=50',
        '/api/conversations?cursor=50&limit=50',
      ]),
    );
  });

  it('shows three recent projects, loads more on demand and keeps pinned ones apart', async () => {
    const user = userEvent.setup();
    const [first, ...rest] = fiveProjects();
    const api = createWorkspaceApi({
      projects: [{ ...first!, pinnedAt: '2026-09-09T12:00:00.000Z' }, ...rest],
    });
    renderWorkspaceAt('/app', api);

    const recent = await screen.findByRole('region', { name: 'Projets' });
    await waitFor(() => expect(within(recent).getAllByRole('group')).toHaveLength(3));
    expect(
      within(recent)
        .getAllByRole('group')
        .map((group) => group.getAttribute('aria-label')),
    ).toEqual(['Deux', 'Trois', 'Quatre']);
    expect(
      within(screen.getByRole('region', { name: 'Épinglés' })).getByRole('group', { name: 'Un' }),
    ).toBeVisible();
    expect(api.calls[0]?.path).toContain('pinned=');

    await user.click(within(recent).getByRole('button', { name: 'Afficher plus' }));

    await waitFor(() => expect(within(recent).getAllByRole('group')).toHaveLength(4));
    expect(within(recent).getByRole('group', { name: 'Cinq' })).toBeVisible();
    expect(within(recent).queryByRole('button', { name: 'Afficher plus' })).not.toBeInTheDocument();
    const requestsAfterLoad = api.calls.length;

    await user.click(within(recent).getByRole('button', { name: 'Afficher moins' }));
    expect(within(recent).getAllByRole('group')).toHaveLength(3);
    expect(
      within(recent).queryByRole('button', { name: 'Afficher moins' }),
    ).not.toBeInTheDocument();
    await user.click(within(recent).getByRole('button', { name: 'Afficher plus' }));
    expect(within(recent).getAllByRole('group')).toHaveLength(4);
    expect(api.calls).toHaveLength(requestsAfterLoad);
    expect(
      api.calls.filter(({ path }) => path.startsWith('/api/projects?')).map(({ path }) => path),
    ).toEqual(
      expect.arrayContaining([
        '/api/projects?limit=3&pinned=false',
        '/api/projects?cursor=3&limit=10&pinned=false',
        '/api/projects?pinned=true',
      ]),
    );
  });
});
