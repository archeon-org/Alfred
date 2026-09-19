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
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nouveau chat dans Projet Atlas' }),
    ).toBeVisible();
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Décisions de lancement');
    await user.click(screen.getByRole('button', { name: 'Envoyer le message' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nouvelle conversation' }),
    ).toBeVisible();
    const projectGroup = screen.getByRole('group', { name: 'Projet Atlas' });
    expect(
      within(projectGroup).getByRole('button', { name: 'Nouvelle conversation' }),
    ).toBeVisible();
    // Without the agent bridge the first message waits in the composer as a draft.
    expect(await screen.findByDisplayValue('Décisions de lancement')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Ouvrir un chat libre' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.type(
      await screen.findByRole('textbox', { name: 'Message' }),
      'Piste indépendante{Enter}',
    );

    // The draft only exists once the created chat's screen has replaced the empty one.
    expect(await screen.findByDisplayValue('Piste indépendante')).toBeVisible();
    expect(
      within(await screen.findByRole('group', { name: 'Chats libres' })).getByRole('button', {
        name: 'Nouvelle conversation',
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
    expect(standalone.map(({ body }) => body)).toEqual([{ projectId: PROJECT_ID }, {}]);
    expect(await screen.findByText('Chat libre')).toBeVisible();
  });

  it('opens a standalone chat from a starter and carries the starter text as a draft', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi();
    renderWorkspaceAt('/app', api);

    await user.click(await screen.findByRole('button', { name: /Aller à l’essentiel/u }));

    // The draft only exists on the created chat's screen; the home heading reads the same.
    expect(await screen.findByDisplayValue(/Aide-moi à synthétiser/u)).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Nouvelle conversation' })).toBeVisible();
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
    // The preview lives in the account menu, which closes on every choice.
    const account = await screen.findByRole('button', { name: /menu du compte/iu });
    await user.click(account);
    const toggle = await screen.findByRole('menuitemcheckbox', { name: 'Aperçu du chargement' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(screen.getByRole('status', { name: 'Chargement de l’espace de travail' })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
    await user.click(account);
    const checked = await screen.findByRole('menuitemcheckbox', { name: 'Aperçu du chargement' });
    expect(checked).toHaveAttribute('aria-checked', 'true');
    await user.click(checked);
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

  it('answers the keyboard shortcuts for the panels, a new conversation and the shortcut settings', async () => {
    const user = userEvent.setup();
    const { router } = renderWorkspaceAt(
      `/app/projects/${PROJECT_ID}`,
      createWorkspaceApi({ projects: [project()] }),
    );
    await screen.findByRole('heading', { level: 1, name: 'Refonte du portail' });
    // jsdom is a narrow screen: the navigation shortcut drives the conversations drawer.
    const drawer = () => screen.getByRole('button', { name: /les conversations$/u });
    expect(drawer()).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Control>}{Shift>},{/Shift}{/Control}');
    expect(drawer()).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Control>}{Shift>},{/Shift}{/Control}');
    expect(drawer()).toHaveAttribute('aria-expanded', 'false');

    expect(
      screen.getByRole('complementary', { name: 'Contexte de la conversation' }),
    ).toBeVisible();
    await user.keyboard('{Control>}{Shift>}.{/Shift}{/Control}');
    expect(
      screen.queryByRole('complementary', { name: 'Contexte de la conversation' }),
    ).not.toBeInTheDocument();

    // The shortcut list lives in the settings, where each key can be changed.
    await user.keyboard('{Control>}/{/Control}');
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/app/settings?section=shortcuts',
      ),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Raccourcis clavier' }),
    ).toBeVisible();
    expect(screen.getByText('Ctrl+Maj+Espace')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Modifier' })).toHaveLength(4);
    await router.navigate(`/app/projects/${PROJECT_ID}`);
    await screen.findByRole('heading', { level: 1, name: 'Refonte du portail' });

    // From a project, the shortcut opens a new chat scoped to that project.
    await user.keyboard('{Control>}{Shift>} {/Shift}{/Control}');
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        `/app/conversations/new?projectId=${PROJECT_ID}`,
      ),
    );
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Nouveau chat dans Refonte du portail',
      }),
    ).toBeVisible();
  });

  it('applies display preferences and uses a dedicated settings frame', async () => {
    const user = userEvent.setup();
    renderWorkspaceAt('/app');
    await user.click(await screen.findByRole('button', { name: /menu du compte/iu }));
    await user.click(await screen.findByRole('menuitem', { name: 'Paramètres' }));
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
