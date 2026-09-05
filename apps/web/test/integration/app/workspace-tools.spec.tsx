import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContextPanel } from '@/components/workspace/context/context-panel';
import { useWorkspaceTools } from '@/hooks/workspace/use-workspace-tools';

function ToolsPreview({
  loaded = false,
  isLoading = false,
}: {
  readonly loaded?: boolean;
  readonly isLoading?: boolean;
}) {
  const tools = useWorkspaceTools();
  const [visible, setVisible] = useState(true);
  return (
    <>
      <button onClick={() => setVisible(!visible)} type="button">
        Panneau
      </button>
      {visible && (
        <ContextPanel
          conversation={
            loaded
              ? {
                  id: 'sample',
                  title: 'Sample',
                  group: 'Hier',
                  category: 'Analyse',
                  messages: [],
                  resources: [
                    {
                      id: 'pdf',
                      name: 'Note.pdf',
                      detail: 'Document de démonstration',
                      format: 'PDF',
                    },
                    {
                      id: 'md',
                      name: 'Brief.md',
                      detail: 'Document de démonstration',
                      format: 'MD',
                    },
                  ],
                }
              : undefined
          }
          isLoading={isLoading}
          tools={tools}
        />
      )}
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Workspace tools local preview', () => {
  it('switches between context, teams, skills and files using accessible tabs', async () => {
    const user = userEvent.setup();
    render(<ToolsPreview />);
    expect(screen.getByRole('tab', { name: 'Contexte' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Équipes' }));
    expect(screen.getByRole('heading', { name: 'Team builder' })).toBeVisible();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Skills' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('switch', { name: 'Synthèse' })).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Fichiers' }));
    expect(screen.getByText('Une place pour vos références.')).toBeVisible();
  });

  it('selects a team and keeps local selections when the panel is hidden', async () => {
    const user = userEvent.setup();
    render(<ToolsPreview />);
    await user.click(screen.getByRole('tab', { name: 'Équipes' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Équipe de la conversation' }),
      'research',
    );
    expect(screen.getByText('Éclaireur')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Panneau' }));
    await user.click(screen.getByRole('button', { name: 'Panneau' }));
    expect(screen.getByRole('combobox', { name: 'Équipe de la conversation' })).toHaveValue(
      'research',
    );
    await user.click(screen.getByRole('tab', { name: 'Skills' }));
    await user.click(screen.getByRole('switch', { name: 'Synthèse' }));
    expect(screen.getByRole('switch', { name: 'Synthèse' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await user.click(screen.getByRole('button', { name: 'Panneau' }));
    await user.click(screen.getByRole('button', { name: 'Panneau' }));
    expect(screen.getByRole('switch', { name: 'Synthèse' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('creates only a named team with members and never sends or persists the preview', async () => {
    const user = userEvent.setup();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const persist = vi.spyOn(Storage.prototype, 'setItem');
    render(<ToolsPreview />);
    await user.click(screen.getByRole('tab', { name: 'Équipes' }));
    await user.click(screen.getByRole('button', { name: 'Créer une équipe' }));
    const dialog = screen.getByRole('dialog', { name: 'Composer une équipe' });
    const create = within(dialog).getByRole('button', { name: 'Ajouter à l’aperçu' });
    expect(create).toBeDisabled();
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Nom de l’équipe' }),
      'Mon atelier',
    );
    expect(create).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: /Analyste/ }));
    expect(create).toBeEnabled();
    await user.click(create);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Mon atelier' })).toBeInTheDocument();
    expect(screen.getByText('Analyste')).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('cancels a new team without adding it and restores focus', async () => {
    const user = userEvent.setup();
    render(<ToolsPreview />);
    await user.click(screen.getByRole('tab', { name: 'Équipes' }));
    const trigger = screen.getByRole('button', { name: 'Créer une équipe' });
    await user.click(trigger);
    await user.type(screen.getByRole('textbox', { name: 'Nom de l’équipe' }), 'Abandonnée');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('option', { name: 'Abandonnée' })).not.toBeInTheDocument();
  });

  it('shows demo files for the selected conversation without offering an upload', async () => {
    const user = userEvent.setup();
    render(<ToolsPreview loaded />);
    expect(screen.getByText('Analyse')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Fichiers' }));
    expect(screen.getByText('Note.pdf')).toBeVisible();
    expect(screen.getByText('Brief.md')).toBeVisible();
    expect(screen.getByText(/Fichiers de démonstration/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Ajouter un fichier/i })).not.toBeInTheDocument();
  });

  it('replaces tool controls with loading placeholders during the preview', () => {
    render(<ToolsPreview isLoading />);
    expect(screen.getByRole('complementary')).toBeVisible();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('rejects whitespace names and deselected members and clears canceled drafts', async () => {
    const user = userEvent.setup();
    render(<ToolsPreview />);
    await user.click(screen.getByRole('tab', { name: 'Équipes' }));
    await user.click(screen.getByRole('button', { name: 'Créer une équipe' }));
    const name = screen.getByRole('textbox', { name: 'Nom de l’équipe' });
    await user.type(name, '   ');
    await user.click(screen.getByRole('checkbox', { name: /Analyste/ }));
    expect(screen.getByRole('button', { name: 'Ajouter à l’aperçu' })).toBeDisabled();
    await user.clear(name);
    await user.type(name, 'Atelier');
    await user.click(screen.getByRole('checkbox', { name: /Analyste/ }));
    expect(screen.getByRole('button', { name: 'Ajouter à l’aperçu' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByRole('button', { name: 'Créer une équipe' }));
    expect(screen.getByRole('textbox', { name: 'Nom de l’équipe' })).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: /Analyste/ })).not.toBeChecked();
  });
});
