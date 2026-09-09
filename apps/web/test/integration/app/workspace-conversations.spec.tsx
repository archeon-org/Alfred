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
} from '../../support/workspace-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function seededApi() {
  return createWorkspaceApi({ projects: [project()], conversations: [conversation()] });
}

describe('Conversation actions', () => {
  it('keeps a standalone conversation after a deletion failure and returns home after retry', async () => {
    const user = userEvent.setup();
    const chat = conversation({ projectKind: 'implicit' });
    const api = createWorkspaceApi({
      projects: [project({ kind: 'implicit', name: null })],
      conversations: [chat],
    });
    api.fail(`DELETE /api/conversations/${chat.id}`, 503);
    renderWorkspaceAt(`/app/conversations/${chat.id}`, api);
    await user.click(
      await screen.findByRole('button', { name: `Actions de la conversation ${chat.title}` }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Supprimer la conversation' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer la conversation' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Impossible de supprimer la conversation.',
    );
    expect(api.conversations).toHaveLength(1);
    api.recover();
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer la conversation' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nouvelle conversation' }),
    ).toBeVisible();
  });

  it('renames the selected conversation from its sidebar menu and updates its heading', async () => {
    const user = userEvent.setup();
    const api = seededApi();
    renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);
    await user.click(
      await screen.findByRole('button', {
        name: 'Actions de la conversation Synthèse du comité projet',
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Renommer la conversation' }));
    const dialog = screen.getByRole('dialog', { name: 'Renommer la conversation' });
    const field = within(dialog).getByRole('textbox', { name: 'Titre de la conversation' });
    expect(field).toHaveValue('Synthèse du comité projet');
    await user.clear(field);
    expect(within(dialog).getByRole('button', { name: 'Renommer' })).toBeDisabled();
    await user.type(field, 'Décisions du comité');
    await user.click(within(dialog).getByRole('button', { name: 'Renommer' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Décisions du comité' }),
    ).toBeVisible();
    expect(api.calls).toContainEqual(
      expect.objectContaining({
        method: 'PATCH',
        path: `/api/conversations/${CONVERSATION_ID}`,
        body: { title: 'Décisions du comité' },
      }),
    );
  });

  it('pins and unpins from the project list, retaining the row after a failed pin', async () => {
    const user = userEvent.setup();
    const api = seededApi();
    api.fail(`POST /api/conversations/${CONVERSATION_ID}/pin`, 503);
    renderWorkspaceAt(`/app/projects/${PROJECT_ID}`, api);
    const list = await screen.findByRole('list', { name: 'Chats du projet' });
    const menu = () =>
      within(list).getByRole('button', {
        name: 'Actions de la conversation Synthèse du comité projet',
      });
    await user.click(menu());
    await user.click(screen.getByRole('menuitem', { name: 'Épingler la conversation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de modifier l’épinglage de la conversation.',
    );
    expect(menu()).toBeVisible();
    api.recover();
    await user.click(menu());
    await user.click(screen.getByRole('menuitem', { name: 'Épingler la conversation' }));
    await waitFor(() => expect(api.conversations[0]?.pinnedAt).not.toBeNull());
    await user.click(menu());
    await user.click(await screen.findByRole('menuitem', { name: 'Désépingler la conversation' }));
    await waitFor(() => expect(api.conversations[0]?.pinnedAt).toBeNull());
  });

  it('requires confirmation to delete the selected conversation and returns to its project', async () => {
    const user = userEvent.setup();
    const api = seededApi();
    renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);
    const openDelete = async () => {
      await user.click(
        await screen.findByRole('button', {
          name: 'Actions de la conversation Synthèse du comité projet',
        }),
      );
      await user.click(screen.getByRole('menuitem', { name: 'Supprimer la conversation' }));
    };
    await openDelete();
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Annuler' }),
    );
    expect(api.calls.some(({ method }) => method === 'DELETE')).toBe(false);
    await openDelete();
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Supprimer la conversation',
      }),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Refonte du portail' }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Actions de la conversation/u }),
      ).not.toBeInTheDocument(),
    );
  });
});
