import { render, screen } from '@testing-library/react';
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
  render(
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

describe('Workspace visual preview', () => {
  it('opens a sample conversation and returns to a fresh draft', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: 'Synthèse du comité projet' }));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Synthèse du comité projet' }),
    ).toBeVisible();
    expect(screen.getByRole('main')).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Nouvelle conversation' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Titre de la conversation' }),
      'Nouvelle conversation',
    );
    await user.click(screen.getByRole('button', { name: 'Créer la conversation' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Nouvelle conversation' })).toBeVisible();
  });

  it('filters the local history and explains an empty search', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const search = screen.getByRole('searchbox', { name: 'Rechercher une conversation' });

    await user.type(search, 'comité');

    expect(screen.getByRole('button', { name: 'Synthèse du comité projet' })).toBeVisible();

    await user.clear(search);
    await user.type(search, 'aucune-correspondance-123');

    expect(screen.getByText('Aucune conversation trouvée')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Synthèse du comité projet' }),
    ).not.toBeInTheDocument();

    await user.clear(search);

    expect(screen.getByRole('button', { name: 'Synthèse du comité projet' })).toBeVisible();
  });

  it('lets loading placeholders be previewed and dismissed without a timer', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const toggle = screen.getByRole('button', { name: 'Aperçu du chargement' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status', { name: 'Chargement de l’espace de travail' })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.queryByRole('status', { name: 'Chargement de l’espace de travail' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeVisible();
  });

  it('can hide and restore the conversation context', async () => {
    const user = userEvent.setup();
    renderWorkspace();

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

  it('keeps drafts and samples local while sending and attachments remain disabled', async () => {
    const user = userEvent.setup();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const persist = vi.spyOn(Storage.prototype, 'setItem');
    renderWorkspace();

    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Un brouillon privé{Enter}');

    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Un brouillon privé\n');
    expect(screen.getByRole('button', { name: /envoyer/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /joindre/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Synthèse du comité projet' }));
    await user.click(screen.getByRole('button', { name: 'Nouvelle conversation' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Titre de la conversation' }),
      'Brouillon suivant',
    );
    await user.click(screen.getByRole('button', { name: 'Créer la conversation' }));

    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    expect(fetch).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });
});
