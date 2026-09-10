import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWorkspaceAt } from '../../support/render-workspace';
import { conversation, createWorkspaceApi, PROJECT_ID, project } from '../../support/workspace-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Workspace organization', () => {
  it('keeps project chats and standalone chats apart', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi({ projects: [project({ name: 'Projet Atlas' })] });
    renderWorkspaceAt(`/app/projects/${PROJECT_ID}`, api);

    await user.click(await screen.findByRole('button', { name: 'Nouvelle conversation' }));
    const conversationDialog = screen.getByRole('dialog', { name: 'Nouvelle conversation' });
    expect(within(conversationDialog).getByText(/Projet Atlas/u)).toBeVisible();
    await user.type(
      within(conversationDialog).getByRole('textbox', { name: 'Titre de la conversation' }),
      'Décisions de lancement',
    );
    await user.click(
      within(conversationDialog).getByRole('button', { name: 'Créer la conversation' }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Décisions de lancement' }),
    ).toBeVisible();
    const projectGroup = screen.getByRole('group', { name: 'Projet Atlas' });
    expect(
      within(projectGroup).getByRole('button', { name: 'Décisions de lancement' }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Ouvrir un chat libre' }));
    const sandboxDialog = screen.getByRole('dialog', { name: 'Nouveau chat libre' });
    await user.type(
      within(sandboxDialog).getByRole('textbox', { name: 'Titre du chat' }),
      'Piste indépendante',
    );
    await user.click(within(sandboxDialog).getByRole('button', { name: 'Ouvrir le chat' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Piste indépendante' }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Chats libres' })).getByRole('button', {
        name: 'Piste indépendante',
      }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Projet Atlas' })).queryByRole('button', {
        name: 'Piste indépendante',
      }),
    ).not.toBeInTheDocument();
    const standalone = api.calls.filter(
      ({ method, path }) => method === 'POST' && path === '/api/conversations',
    );
    expect(standalone.map(({ body }) => body)).toEqual([
      { projectId: PROJECT_ID, title: 'Décisions de lancement' },
      { title: 'Piste indépendante' },
    ]);
    expect(screen.getByText('Chat libre')).toBeVisible();
  });

  it('opens a standalone chat from a starter and carries the starter text as a draft', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi();
    renderWorkspaceAt('/app', api);

    await user.click(await screen.findByRole('button', { name: /Aller à l’essentiel/u }));

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Aide-moi à synthétiser ce sujet et à en dégager les points clés.',
      }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(
      'Aide-moi à synthétiser ce sujet et à en dégager les points clés.',
    );
    expect(api.projects.at(-1)?.kind).toBe('implicit');
  });

  it('filters the history and explains an empty search', async () => {
    const user = userEvent.setup();
    renderWorkspaceAt(
      '/app',
      createWorkspaceApi({ conversations: [conversation()], projects: [project()] }),
    );
    const search = screen.getByRole('searchbox', { name: 'Rechercher une conversation' });
    expect(await screen.findByRole('button', { name: 'Refonte du portail' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Synthèse du comité projet' }),
    ).not.toBeInTheDocument();

    await user.type(search, 'comité');
    expect(screen.getByRole('button', { name: 'Synthèse du comité projet' })).toBeVisible();

    await user.clear(search);
    await user.type(search, 'aucune-correspondance-123');
    expect(screen.getByText('Aucun chat libre trouvé')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Synthèse du comité projet' }),
    ).not.toBeInTheDocument();
  });

  it('previews loading placeholders and hides or restores the context panel', async () => {
    const user = userEvent.setup();
    renderWorkspaceAt('/app');
    const toggle = await screen.findByRole('button', { name: 'Aperçu du chargement' });

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status', { name: 'Chargement de l’espace de travail' })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeVisible();

    expect(
      screen.getByRole('complementary', { name: 'Contexte de la conversation' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Masquer le contexte' }));
    expect(
      screen.queryByRole('complementary', { name: 'Contexte de la conversation' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Afficher le contexte' }));
    expect(
      screen.getByRole('complementary', { name: 'Contexte de la conversation' }),
    ).toBeVisible();
  });

  it('applies display preferences and uses a dedicated settings frame', async () => {
    const user = userEvent.setup();
    renderWorkspaceAt('/app');
    await user.click(await screen.findByRole('link', { name: 'Paramètres' }));
    expect(
      screen.queryByRole('complementary', { name: 'Contexte de la conversation' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Navigation principale' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Navigation compacte' }));
    await user.click(screen.getByRole('switch', { name: 'Réduire les animations' }));
    await user.click(screen.getByRole('link', { name: 'Retour à Alfred' }));
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-density', 'compact');
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-reduced-motion', 'true');
    expect(JSON.parse(localStorage.getItem('alfred.appearance.v1') ?? '{}')).toMatchObject({
      density: 'compact',
      reducedMotion: true,
    });
  });

  it('dismisses project creation with Escape without any request', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi();
    renderWorkspaceAt('/app', api);
    const trigger = await screen.findByRole('button', { name: 'Créer un projet' });

    await user.click(trigger);
    await user.type(screen.getByRole('textbox', { name: 'Nom du projet' }), 'Projet abandonné');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(api.calls.some(({ method }) => method === 'POST')).toBe(false);
  });
});
