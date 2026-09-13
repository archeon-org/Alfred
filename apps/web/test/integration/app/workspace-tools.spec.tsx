import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContextPanel } from '@/components/workspace/context/context-panel';
import { useWorkspaceTools } from '@/hooks/workspace/use-workspace-tools';

vi.mock('@/hooks/feature-flags/use-feature-flags-query', () => ({
  useFeatureFlagsQuery: () => ({ status: 'ready', flags: { skills: false } }),
}));

function ToolsPreview({ isLoading = false }: { readonly isLoading?: boolean }) {
  const tools = useWorkspaceTools();
  const [visible, setVisible] = useState(true);
  return (
    <>
      <button onClick={() => setVisible(!visible)} type="button">
        Panneau
      </button>
      {visible && <ContextPanel isLoading={isLoading} tools={tools} />}
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Workspace tools local preview', () => {
  it('switches between teams, skills and files using accessible tabs', async () => {
    const user = userEvent.setup();
    render(<ToolsPreview />);
    expect(screen.queryByRole('tab', { name: 'Contexte' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Équipes' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Team builder' })).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Équipes' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Skills' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Le catalogue de skills est désactivé.')).toBeVisible();
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

  it('announces files as a later capability', async () => {
    const user = userEvent.setup();
    render(<ToolsPreview />);
    await user.click(screen.getByRole('tab', { name: 'Fichiers' }));
    expect(screen.getByText(/lecture de documents seront disponibles/)).toBeVisible();
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
