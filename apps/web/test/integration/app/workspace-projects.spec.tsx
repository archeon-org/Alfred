import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWorkspaceAt } from '../../support/render-workspace';
import {
  conversation,
  createWorkspaceApi,
  IMPLICIT_PROJECT_ID,
  PROJECT_ID,
  project,
  STANDALONE_CONVERSATION_ID,
} from '../../support/workspace-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function seededApi() {
  return createWorkspaceApi({
    conversations: [
      conversation(),
      conversation({
        createdAt: '2026-09-08T09:00:00.000Z',
        id: STANDALONE_CONVERSATION_ID,
        projectId: IMPLICIT_PROJECT_ID,
        projectKind: 'implicit',
        title: 'Piste libre',
      }),
    ],
    projects: [
      project({ description: '# Cap\n\nPenser la **prochaine** version.' }),
      project({ id: IMPLICIT_PROJECT_ID, kind: 'implicit', name: null }),
    ],
  });
}

describe('Workspace projects', () => {
  it('lists real projects and chats, keeps implicit shells hidden and opens a project page', async () => {
    const user = userEvent.setup();
    renderWorkspaceAt('/app', seededApi());

    const projectButton = await screen.findByRole('button', { name: 'Refonte du portail' });
    expect(
      screen.getAllByRole('group', { name: /^(Refonte du portail|Chats libres)$/u }),
    ).toHaveLength(2);
    expect(
      within(screen.getByRole('group', { name: 'Chats libres' })).getByRole('button', {
        name: 'Piste libre',
      }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Nouvelle conversation' })).toBeVisible();

    await user.click(projectButton);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Refonte du portail' }),
    ).toBeVisible();
    expect(screen.queryByText('Cap Penser la prochaine version.')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Chats/u })).toHaveAttribute('aria-selected', 'true');
    const chats = await screen.findByRole('list', { name: 'Chats du projet' });
    expect(
      within(chats).getByRole('button', { name: /^Synthèse du comité projet/u }),
    ).toBeVisible();
    expect(within(chats).queryByRole('button', { name: /Piste libre/u })).not.toBeInTheDocument();

    await user.click(
      within(screen.getByRole('tablist', { name: 'Contenu du projet' })).getByRole('tab', {
        name: 'Contexte',
      }),
    );

    expect(screen.queryByRole('heading', { name: 'Description' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Contexte du projet' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Préférences du projet' })).toBeVisible();
  });

  it('creates a project from the sidebar with an idempotency key and lands on its page', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi();
    renderWorkspaceAt('/app', api);

    expect(await screen.findByText(/Aucun projet pour le moment/u)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Créer un projet' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau projet' });
    expect(within(dialog).getByRole('button', { name: 'Créer le projet' })).toBeDisabled();
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Nom du projet' }),
      '  Projet Atlas ',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Créer le projet' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Projet Atlas' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const creation = api.calls.find(
      ({ method, path }) => method === 'POST' && path === '/api/projects',
    );
    expect(creation?.body).toEqual({ name: 'Projet Atlas' });
    expect(creation?.headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/u);
    expect(creation?.headers.get('authorization')).toBe('Bearer memory-only-test-token');
    expect(
      within(screen.getByRole('group', { name: 'Projet Atlas' })).getByRole('button', {
        name: 'Projet Atlas',
      }),
    ).toHaveAttribute('aria-current', 'true');
  });

  it('opens a chat from the project input, titles it from the text and keeps the draft', async () => {
    const user = userEvent.setup();
    const api = seededApi();
    renderWorkspaceAt(`/app/projects/${PROJECT_ID}`, api);

    const input = await screen.findByRole('textbox', {
      name: /Nouveau chat dans Refonte du portail/u,
    });
    await user.type(input, 'Peux-tu résumer le dernier comité ?{Enter}');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Peux-tu résumer le dernier comité ?' }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(
      'Peux-tu résumer le dernier comité ?',
    );
    expect(screen.getByRole('button', { name: 'Envoyer le message' })).toBeDisabled();
    expect(api.calls).toContainEqual(
      expect.objectContaining({
        body: { projectId: PROJECT_ID, title: 'Peux-tu résumer le dernier comité ?' },
        method: 'POST',
        path: '/api/conversations',
      }),
    );
    expect(
      within(screen.getByRole('group', { name: 'Refonte du portail' })).getByRole('button', {
        name: 'Peux-tu résumer le dernier comité ?',
      }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('renames a project and saves its context through the Markdown editor with a preview', async () => {
    const user = userEvent.setup();
    const api = seededApi();
    renderWorkspaceAt(`/app/projects/${PROJECT_ID}`, api);

    await screen.findByRole('heading', { level: 1, name: 'Refonte du portail' });
    await user.click(
      within(screen.getByRole('main')).getByRole('button', {
        name: 'Actions du projet Refonte du portail',
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Renommer le projet' }));
    const rename = screen.getByRole('dialog', { name: 'Renommer le projet' });
    const nameField = within(rename).getByRole('textbox', { name: 'Nom du projet' });
    expect(nameField).toHaveValue('Refonte du portail');
    expect(within(rename).getByRole('button', { name: 'Renommer' })).toBeDisabled();
    await user.clear(nameField);
    await user.type(nameField, 'Portail v2');
    await user.click(within(rename).getByRole('button', { name: 'Renommer' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Portail v2' })).toBeVisible();
    expect(api.calls).toContainEqual(
      expect.objectContaining({ body: { name: 'Portail v2' }, method: 'PATCH' }),
    );

    await user.click(
      within(screen.getByRole('tablist', { name: 'Contenu du projet' })).getByRole('tab', {
        name: 'Contexte',
      }),
    );
    const editor = screen.getByRole('region', { name: 'Contexte du projet' });
    const textarea = within(editor).getByRole('textbox', { name: 'Contexte du projet' });
    expect(textarea).toHaveValue('');
    await user.clear(textarea);
    await user.type(
      textarea,
      '# Objectif{Enter}{Enter}Une **refonte** [[utile](https://alfred.test).',
    );
    await user.click(within(editor).getByRole('tab', { name: 'Aperçu' }));
    const preview = within(editor).getByRole('region', { name: 'Aperçu · Contexte du projet' });
    expect(within(preview).getByRole('heading', { level: 1, name: 'Objectif' })).toBeVisible();
    expect(within(preview).getByRole('link', { name: 'utile' })).toHaveAttribute(
      'rel',
      'noreferrer noopener',
    );
    await user.click(
      within(editor).getByRole('button', { name: 'Enregistrer · Contexte du projet' }),
    );

    await waitFor(() => expect(within(editor).getByRole('status')).toHaveTextContent('À jour'));
    expect(api.calls).toContainEqual(
      expect.objectContaining({
        body: {
          content: '# Objectif\n\nUne **refonte** [utile](https://alfred.test).',
          expectedRevision: 0,
        },
        method: 'PUT',
        path: `/api/projects/${PROJECT_ID}/context-documents/context`,
      }),
    );
  });

  it('deletes a project only after an explicit confirmation and returns home', async () => {
    const user = userEvent.setup();
    const api = seededApi();
    renderWorkspaceAt(`/app/projects/${PROJECT_ID}`, api);

    const openPageMenu = async () => {
      await screen.findByRole('heading', { level: 1, name: 'Refonte du portail' });
      await user.click(
        within(screen.getByRole('main')).getByRole('button', {
          name: 'Actions du projet Refonte du portail',
        }),
      );
    };
    await openPageMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Supprimer le projet' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Supprimer ce projet ?' });
    expect(within(confirm).getByText(/tous ses chats seront supprimés/u)).toBeVisible();
    await user.click(within(confirm).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(api.calls.some(({ method }) => method === 'DELETE')).toBe(false);

    await openPageMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Supprimer le projet' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer le projet' }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nouvelle conversation' }),
    ).toBeVisible();
    expect(api.calls).toContainEqual(
      expect.objectContaining({ method: 'DELETE', path: `/api/projects/${PROJECT_ID}` }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Refonte du portail' })).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: 'Synthèse du comité projet' }),
    ).not.toBeInTheDocument();
  });

  it('reports a failed navigation load with a retry and recovers', async () => {
    const user = userEvent.setup();
    const api = seededApi();
    api.fail('GET /api/projects', 503);
    renderWorkspaceAt('/app', api);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger vos projets.');
    api.recover();
    await user.click(within(alert).getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByRole('button', { name: 'Refonte du portail' })).toBeVisible();
  });

  it('never carries an unsent draft from one chat to another', async () => {
    const user = userEvent.setup();
    const api = seededApi();
    api.conversations.push(
      conversation({
        createdAt: '2026-09-07T09:00:00.000Z',
        id: '5c4d3e2f-1a0b-4c9d-8e7f-6a5b4c3d2e1f',
        title: 'Autre chat du projet',
      }),
    );
    renderWorkspaceAt(`/app/projects/${PROJECT_ID}`, api);

    const chats = await screen.findByRole('list', { name: 'Chats du projet' });
    await user.click(within(chats).getByRole('button', { name: /^Synthèse du comité projet/u }));
    const composer = await screen.findByRole('textbox', { name: 'Message' });
    await user.type(composer, 'Un brouillon privé');
    expect(composer).toHaveValue('Un brouillon privé');

    await user.click(
      within(screen.getByRole('group', { name: 'Refonte du portail' })).getByRole('button', {
        name: 'Autre chat du projet',
      }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Autre chat du projet' }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    expect(api.calls.some(({ method }) => method === 'POST')).toBe(false);
  });

  it('explains a missing project without leaking the identifier format', async () => {
    renderWorkspaceAt('/app/projects/not-a-real-project', seededApi());

    expect(await screen.findByRole('heading', { name: 'Projet introuvable' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Ce projet n’existe plus.');
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute(
      'href',
      '/app',
    );
  });
});
