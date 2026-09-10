import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWorkspaceAt } from '../../support/render-workspace';
import { createWorkspaceApi, project, PROJECT_ID } from '../../support/workspace-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Personal context settings', () => {
  it('saves personal documents independently with their revisions and keeps appearance shared', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi();
    const { router } = renderWorkspaceAt('/app/settings', api);
    const instructions = await screen.findByRole('textbox', { name: 'Instructions générales' });
    await user.type(instructions, 'Respecte mes consignes.');
    await user.click(screen.getByRole('button', { name: 'Enregistrer · Instructions générales' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Enregistrer · Instructions générales' }),
      ).toBeDisabled(),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Préférences de réponse' }),
      'Réponds en français.',
    );
    await user.click(screen.getByRole('button', { name: 'Enregistrer · Préférences de réponse' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Enregistrer · Préférences de réponse' }),
      ).toBeDisabled(),
    );
    expect(
      api.calls.filter((call) => call.method === 'PUT').map((call) => [call.path, call.body]),
    ).toEqual([
      [
        '/api/context/personal/instructions',
        { content: 'Respecte mes consignes.', expectedRevision: 0 },
      ],
      [
        '/api/context/personal/preferences',
        { content: 'Réponds en français.', expectedRevision: 0 },
      ],
    ]);
    await user.click(screen.getByRole('switch', { name: 'Navigation compacte' }));
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-density', 'compact');
    await router.navigate('/app');
    await user.click(screen.getByRole('button', { name: 'Paramètres' }));
    expect(screen.getByRole('switch', { name: 'Navigation compacte' })).toBeChecked();
    await user.click(screen.getByRole('link', { name: 'Tous les paramètres' }));
    expect(await screen.findByRole('textbox', { name: 'Instructions générales' })).toHaveValue(
      'Respecte mes consignes.',
    );
  });

  it('preserves a draft after conflict and requires confirmation before loading the server version', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi();
    renderWorkspaceAt('/app/settings', api);
    const editor = await screen.findByRole('textbox', { name: 'Instructions générales' });
    await user.type(editor, 'Brouillon privé');
    api.fail('PUT /api/context/personal/instructions', 409, 'context_revision_conflict');
    await user.click(screen.getByRole('button', { name: 'Enregistrer · Instructions générales' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('modifié ailleurs');
    expect(editor).toHaveValue('Brouillon privé');
    await user.click(screen.getByRole('button', { name: 'Recharger la version enregistrée' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(editor).toHaveValue('Brouillon privé');
    await user.click(screen.getByRole('button', { name: 'Recharger la version enregistrée' }));
    await user.click(screen.getByRole('button', { name: 'Recharger et remplacer' }));
    await waitFor(() => expect(editor).toHaveValue(''));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('protects drafts across project tabs and blocks navigation until explicitly abandoned', async () => {
    const user = userEvent.setup();
    renderWorkspaceAt(`/app/projects/${PROJECT_ID}`, createWorkspaceApi({ projects: [project()] }));
    await user.click(
      within(await screen.findByRole('tablist', { name: 'Contenu du projet' })).getByRole('tab', {
        name: 'Contexte',
      }),
    );
    const editor = await screen.findByRole('textbox', { name: 'Contexte du projet' });
    await user.type(editor, 'Contexte non enregistré');
    await user.click(screen.getByRole('tab', { name: /Chats/u }));
    await user.click(
      within(screen.getByRole('tablist', { name: 'Contenu du projet' })).getByRole('tab', {
        name: 'Contexte',
      }),
    );
    expect(editor).toHaveValue('Contexte non enregistré');
    await user.click(screen.getByRole('button', { name: 'Paramètres' }));
    await user.click(screen.getByRole('link', { name: 'Tous les paramètres' }));
    const prompt = screen.getByRole('alertdialog', { name: 'Quitter sans enregistrer ?' });
    await user.click(within(prompt).getByRole('button', { name: 'Continuer à modifier' }));
    expect(editor).toHaveValue('Contexte non enregistré');
    await user.click(screen.getByRole('button', { name: 'Paramètres' }));
    await user.click(screen.getByRole('link', { name: 'Tous les paramètres' }));
    await user.click(screen.getByRole('button', { name: 'Quitter sans enregistrer' }));
    expect(await screen.findByRole('heading', { name: 'Personnaliser Alfred' })).toBeVisible();
  });

  it('imports text into a draft only, confirms replacement and rejects unsupported files', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const api = createWorkspaceApi();
    renderWorkspaceAt('/app/settings', api);
    const editor = await screen.findByRole('textbox', { name: 'Instructions générales' });
    const input = screen.getByLabelText('Importer · Instructions générales');
    await user.upload(input, new File(['pdf'], 'notes.pdf'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Markdown');
    const imported = new File(['# Notes'], 'notes.md', { type: 'text/markdown' });
    Object.defineProperty(imported, 'arrayBuffer', {
      value: () => Promise.resolve(new TextEncoder().encode('# Notes\r\nÉquipe').buffer),
    });
    await user.upload(input, imported);
    await waitFor(() => expect(editor).toHaveValue('# Notes\nÉquipe'));
    expect(api.calls.some((call) => call.method === 'PUT')).toBe(false);
    const replacement = new File(['Autre'], 'other.txt');
    Object.defineProperty(replacement, 'arrayBuffer', {
      value: () => Promise.resolve(new TextEncoder().encode('Autre').buffer),
    });
    await user.upload(input, replacement);
    expect(editor).toHaveValue('# Notes\nÉquipe');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.upload(input, replacement);
    await user.click(screen.getByRole('button', { name: 'Remplacer le brouillon' }));
    expect(editor).toHaveValue('Autre');
    await user.click(screen.getByRole('button', { name: 'Enregistrer · Instructions générales' }));
    await waitFor(() => expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(1));
    expect(api.calls.find((call) => call.method === 'PUT')?.body).toEqual({
      content: 'Autre',
      expectedRevision: 0,
    });
  });

  it('retries unavailable context without inventing saved values', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi();
    api.fail('GET /api/context/personal', 503);
    renderWorkspaceAt('/app/settings', api);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de charger vos contenus',
    );
    expect(
      screen.queryByRole('textbox', { name: 'Instructions générales' }),
    ).not.toBeInTheDocument();
    api.recover();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('textbox', { name: 'Instructions générales' })).toHaveValue('');
  });
  it('isolates drafts and revisions when moving directly between projects', async () => {
    const user = userEvent.setup();
    const otherId = '00000000-0000-4000-8000-000000000055';
    const api = createWorkspaceApi({
      projects: [project(), project({ id: otherId, name: 'Projet B' })],
    });
    renderWorkspaceAt(`/app/projects/${PROJECT_ID}`, api);
    await user.click(
      within(await screen.findByRole('tablist', { name: 'Contenu du projet' })).getByRole('tab', {
        name: 'Contexte',
      }),
    );
    await user.type(
      await screen.findByRole('textbox', { name: 'Contexte du projet' }),
      'Projet A privé',
    );
    await user.click(screen.getByRole('button', { name: 'Projet B' }));
    await user.click(screen.getByRole('button', { name: 'Quitter sans enregistrer' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Projet B' })).toBeVisible();
    const field = await screen.findByRole('textbox', { name: 'Contexte du projet' });
    expect(field).toHaveValue('');
    await user.type(field, 'Projet B seulement');
    await user.click(screen.getByRole('button', { name: 'Enregistrer · Contexte du projet' }));
    await waitFor(() => expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(1));
    expect(api.calls.find((call) => call.method === 'PUT')).toMatchObject({
      path: `/api/projects/${otherId}/context-documents/context`,
      body: { content: 'Projet B seulement', expectedRevision: 0 },
    });
  });
});
