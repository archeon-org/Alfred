import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionContext, type SessionContextValue } from '@/contexts/session/session-context';
import { WorkspaceScreen } from '@/screens/workspace/workspace-screen';

const session: SessionContextValue = {
  accessToken: 'memory-only-test-token',
  logout: () => Promise.resolve(),
  refresh: () => Promise.resolve(null),
  status: 'authenticated',
  user: {
    displayName: 'Ada Lovelace',
    email: 'ada@example.test',
    id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
    role: 'user',
  },
};

function renderWorkspace() {
  return render(
    <MemoryRouter>
      <SessionContext.Provider value={session}>
        <WorkspaceScreen />
      </SessionContext.Provider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Local workspace organization', () => {
  it('creates and selects a named project without creating a conversation', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: 'Créer un projet' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau projet' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Nom du projet' }), 'Projet Atlas');
    await user.click(within(dialog).getByRole('button', { name: 'Créer le projet' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Nouvelle conversation' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Projet Atlas' })).toBeVisible();
  });

  it('keeps project conversations separate from standalone sandboxes without persisting them', async () => {
    const user = userEvent.setup();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const persist = vi.spyOn(Storage.prototype, 'setItem');
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: 'Créer un projet' }));
    await user.type(screen.getByRole('textbox', { name: 'Nom du projet' }), 'Projet Atlas');
    await user.click(screen.getByRole('button', { name: 'Créer le projet' }));
    await user.click(screen.getByRole('button', { name: 'Nouvelle conversation' }));
    const conversationDialog = screen.getByRole('dialog', { name: 'Nouvelle conversation' });
    expect(within(conversationDialog).getByText(/Projet Atlas/)).toBeVisible();
    await user.type(
      within(conversationDialog).getByRole('textbox', { name: 'Titre de la conversation' }),
      'Décisions de lancement',
    );
    await user.click(
      within(conversationDialog).getByRole('button', { name: 'Créer la conversation' }),
    );

    const project = screen.getByRole('group', { name: 'Projet Atlas' });
    expect(within(project).getByRole('button', { name: 'Décisions de lancement' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Décisions de lancement' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Créer une sandbox' }));
    const sandboxDialog = screen.getByRole('dialog', { name: 'Nouvelle sandbox' });
    await user.type(
      within(sandboxDialog).getByRole('textbox', { name: 'Titre de la conversation' }),
      'Piste indépendante',
    );
    await user.click(within(sandboxDialog).getByRole('button', { name: 'Créer la sandbox' }));

    expect(
      within(screen.getByRole('group', { name: 'Sandboxes' })).getByRole('button', {
        name: 'Piste indépendante',
      }),
    ).toBeVisible();
    expect(
      within(project).queryByRole('button', { name: 'Piste indépendante' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Piste indépendante' })).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('applies display preferences immediately and keeps them local', async () => {
    const user = userEvent.setup();
    const persist = vi.spyOn(Storage.prototype, 'setItem');
    const { container } = renderWorkspace();
    const workspace = container.querySelector('[data-density]');

    await user.click(screen.getByRole('button', { name: 'Paramètres' }));
    const dialog = screen.getByRole('dialog', { name: 'Paramètres' });
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Taille du texte' }),
      'comfortable',
    );
    await user.click(within(dialog).getByRole('switch', { name: 'Navigation compacte' }));
    await user.click(within(dialog).getByRole('switch', { name: 'Réduire les animations' }));

    expect(workspace).toHaveAttribute('data-text-size', 'comfortable');
    expect(workspace).toHaveAttribute('data-density', 'compact');
    expect(workspace).toHaveAttribute('data-reduced-motion', 'true');
    expect(persist).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paramètres' })).toHaveFocus();
    expect(workspace).toHaveAttribute('data-text-size', 'comfortable');
  });

  it('dismisses project creation with Escape without creating an entry', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const trigger = screen.getByRole('button', { name: 'Créer un projet' });

    await user.click(trigger);
    await user.type(screen.getByRole('textbox', { name: 'Nom du projet' }), 'Projet abandonné');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Projet abandonné' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
