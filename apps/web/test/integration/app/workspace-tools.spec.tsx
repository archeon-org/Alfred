import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContextPanel } from '@/components/workspace/context/context-panel';
import { useWorkspaceTools } from '@/hooks/workspace/use-workspace-tools';

const state = vi.hoisted(() => ({
  teams: true,
  catalog: {
    agents: [] as unknown[],
    query: { isPending: false, isError: false, refetch: () => Promise.resolve() },
  },
}));

vi.mock('@/hooks/feature-flags/use-feature-flags-query', () => ({
  useFeatureFlagsQuery: () => ({ status: 'ready', flags: { skills: false, teams: state.teams } }),
}));

// The catalog hook is exercised through its service; here it only feeds the panel.
vi.mock('@/hooks/agents/use-agent-catalog', () => ({
  useAgentCatalog: () => state.catalog,
}));

const topology = {
  id: '98480af1-6fd5-51b1-9b43-97834987e6ea',
  graphId: 'topology',
  name: 'topology',
  shortDescription: 'AI-Ops infrastructure topology explorer.',
  description: 'Traverses nodes and relationships of the infrastructure graph.',
  tags: ['topology', 'aiops'],
};

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
  state.teams = true;
  state.catalog = {
    agents: [],
    query: { isPending: false, isError: false, refetch: () => Promise.resolve() },
  };
});

describe('Équipes tab behind the teams capability', () => {
  it('lists the sub-agents compactly and shows their details in a dialog', async () => {
    const user = userEvent.setup();
    state.catalog = {
      ...state.catalog,
      agents: [topology, { ...topology, id: 'b', name: 'base_react_basic' }],
    };
    render(<ToolsPreview />);
    const list = screen.getByRole('list', { name: 'Agents spécialistes' });
    expect(within(list).getByRole('heading', { name: 'Topology' })).toBeVisible();
    expect(within(list).getByRole('heading', { name: 'Base react basic' })).toBeVisible();
    expect(within(list).queryByText('AI-Ops infrastructure topology explorer.')).toBeNull();
    const opener = within(list).getByRole('button', { name: 'Détails de Topology' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Topology' });
    expect(dialog).toHaveTextContent('AI-Ops infrastructure topology explorer.');
    expect(dialog).toHaveTextContent(/Traverses nodes and relationships/);
    expect(within(dialog).getByRole('list', { name: 'Thèmes de Topology' })).toHaveTextContent(
      'topologyaiops',
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('announces loading, an empty catalog and a retryable failure', async () => {
    const user = userEvent.setup();
    state.catalog = { ...state.catalog, query: { ...state.catalog.query, isPending: true } };
    const { rerender } = render(<ToolsPreview />);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des agents…');

    state.catalog = {
      agents: [],
      query: { isPending: false, isError: false, refetch: () => Promise.resolve() },
    };
    rerender(<ToolsPreview />);
    expect(screen.getByText('Aucun agent spécialiste n’est déclaré.')).toBeVisible();

    const refetch = vi.fn(() => Promise.resolve());
    state.catalog = { agents: [], query: { isPending: false, isError: true, refetch } };
    rerender(<ToolsPreview />);
    expect(screen.getByRole('alert')).toHaveTextContent('Impossible de charger les agents.');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('removes the tab entirely when the capability is off', () => {
    state.teams = false;
    render(<ToolsPreview />);
    expect(screen.queryByRole('tab', { name: 'Équipes' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Skills' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: 'Agents spécialistes' })).not.toBeInTheDocument();
  });
});

describe('Workspace tools', () => {
  it('switches between teams, skills and files using accessible tabs', async () => {
    const user = userEvent.setup();
    render(<ToolsPreview />);
    expect(screen.queryByRole('tab', { name: 'Contexte' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Équipes' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Agents spécialistes' })).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Équipes' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Skills' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Le catalogue de skills est désactivé.')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Fichiers' }));
    expect(screen.getByText('Une place pour vos références.')).toBeVisible();
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
});
