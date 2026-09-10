import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWorkspaceAt } from '../../support/render-workspace';
import * as skillPackage from '@/lib/skills/skill-package';
import { createSkillsApi, skillFixture } from '../../support/skills-api';

describe('Skills catalogue', () => {
  it('creates, publishes and deletes a private skill with confirmation', async () => {
    const user = userEvent.setup();
    const api = createSkillsApi();
    renderWorkspaceAt('/app/skills', api);
    await user.click(await screen.findByRole('button', { name: 'Créer un skill' }));
    await user.type(screen.getByRole('textbox', { name: 'Nom du skill' }), 'synthese');
    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Résumer un document');
    await user.type(screen.getByRole('textbox', { name: 'Contenu de SKILL.md' }), '# Instructions');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    await user.click(await screen.findByRole('button', { name: 'Actions du skill synthese' }));
    await user.click(screen.getByRole('menuitem', { name: 'Publier synthese' }));
    expect(await screen.findByText('Publié · v1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions du skill synthese' }));
    await user.click(screen.getByRole('menuitem', { name: 'Supprimer synthese' }));
    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
      '« synthese » et tout son historique seront définitivement supprimés.',
    );
    expect(api.skillCalls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer le skill' }),
    );
    expect(
      await screen.findByText('Aucun skill. Créez votre première méthode.'),
    ).toBeInTheDocument();
    expect(api.skillCalls.find((call) => call.method === 'DELETE')?.body).toEqual({
      expectedVersion: 2,
    });
  });
  it('preserves edits on version conflict', async () => {
    const user = userEvent.setup();
    const api = createSkillsApi([skillFixture()]);
    api.setConflict();
    renderWorkspaceAt('/app/skills', api);
    await user.click(await screen.findByRole('button', { name: 'Modifier synthese' }));
    const text = await screen.findByRole('textbox', { name: 'Contenu de SKILL.md' });
    await user.clear(text);
    await user.type(text, '# Brouillon privé');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(await screen.findByText(/Ce skill a été modifié ailleurs/)).toBeInTheDocument();
    expect(text).toHaveValue('# Brouillon privé');
  });
  it('does not request skills or expose editor when flag is off', async () => {
    const api = createSkillsApi([], false);
    renderWorkspaceAt('/app/skills', api);
    expect(await screen.findByText('Le catalogue de skills est désactivé.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Créer un skill' })).not.toBeInTheDocument();
    expect(api.skillCalls).toHaveLength(0);
  });
  it('shows a compact list with an accessible import action and no catalogue switches', async () => {
    renderWorkspaceAt('/app/skills', createSkillsApi([skillFixture()]));
    const list = await screen.findByRole('list', { name: 'Mes skills' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByRole('button', { name: 'Modifier synthese' })).toBeInTheDocument();
    expect(within(list).queryByRole('switch')).not.toBeInTheDocument();
    expect(within(list).queryByText('Désactivé')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importer Markdown ou ZIP' })).toBeEnabled();
    expect(screen.getByLabelText('Fichier Markdown ou ZIP')).not.toBeVisible();
    expect(screen.queryByRole('button', { name: 'Rechercher' })).not.toBeInTheDocument();
  });

  it('debounces live search and clearing for 300ms without submitting', async () => {
    const api = createSkillsApi([skillFixture()]);
    renderWorkspaceAt('/app/skills', api);
    const input = await screen.findByRole('searchbox', { name: 'Rechercher un skill' });
    await screen.findByRole('button', { name: 'Modifier synthese' });
    const searches = () =>
      api.fetch.mock.calls
        .map(
          ([url]) =>
            new URL(
              typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
              'http://localhost',
            ),
        )
        .filter((url) => url.pathname === '/api/skills')
        .map((url) => url.searchParams.get('search') || null);
    vi.useFakeTimers();
    try {
      fireEvent.change(input, { target: { value: 'syn' } });
      await act(() => vi.advanceTimersByTimeAsync(200));
      fireEvent.change(input, { target: { value: 'synthese' } });
      await act(() => vi.advanceTimersByTimeAsync(299));
      expect(searches()).toEqual([null]);
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(searches()).toEqual([null, 'synthese']);
      fireEvent.change(input, { target: { value: '' } });
      await act(() => vi.advanceTimersByTimeAsync(300));
      expect(searches().at(-1)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('imports into the new skill page without creating a server record', async () => {
    const user = userEvent.setup();
    const api = createSkillsApi();
    const { router } = renderWorkspaceAt('/app/skills', api);
    await screen.findByRole('button', { name: 'Créer un skill' });
    await user.upload(
      screen.getByLabelText('Fichier Markdown ou ZIP'),
      new File(
        ['---\nname: imported\ndescription: Imported method\n---\n# Instructions'],
        'SKILL.md',
        { type: 'text/markdown' },
      ),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/skills/new'));
    expect(await screen.findByRole('textbox', { name: 'Nom du skill' })).toHaveValue('imported');
    expect(api.skillCalls.filter((call) => call.method === 'POST')).toHaveLength(0);
  });
  it('shows a disabled badge only for disabled skills without offering a toggle', async () => {
    const user = userEvent.setup();
    renderWorkspaceAt('/app/skills', createSkillsApi([skillFixture({ enabled: false })]));
    const list = await screen.findByRole('list', { name: 'Mes skills' });
    expect(within(list).getByText('Désactivé')).toBeInTheDocument();
    expect(
      within(list).getByRole('button', { name: 'Modifier synthese' }),
    ).toHaveAccessibleDescription(/Désactivé/);
    expect(within(list).queryByRole('switch')).not.toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Actions du skill synthese' }));
    expect(screen.queryByRole('menuitem', { name: /activer/i })).not.toBeInTheDocument();
  });

  it('filters results while typing and restores the catalogue when cleared', async () => {
    const user = userEvent.setup();
    renderWorkspaceAt('/app/skills', createSkillsApi([skillFixture()]));
    await screen.findByRole('button', { name: 'Modifier synthese' });
    const search = screen.getByRole('searchbox', { name: 'Rechercher un skill' });
    await user.type(search, 'no-match');
    expect(await screen.findByText('Aucun skill trouvé.')).toBeInTheDocument();
    await user.clear(search);
    expect(await screen.findByRole('button', { name: 'Modifier synthese' })).toBeInTheDocument();
  });

  it('exports the selected skill through its action menu', async () => {
    const user = userEvent.setup();
    const api = createSkillsApi([skillFixture()]);
    const createUrl = vi.fn(() => 'blob:skill-export');
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = createUrl;
        static override revokeObjectURL = vi.fn();
      },
    );
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      renderWorkspaceAt('/app/skills', api);
      await user.click(await screen.findByRole('button', { name: 'Actions du skill synthese' }));
      await user.click(screen.getByRole('menuitem', { name: 'Exporter synthese' }));
      await waitFor(() => expect(download).toHaveBeenCalledOnce());
      expect(createUrl).toHaveBeenCalledWith(expect.any(Blob));
      expect(api.skillCalls.every((call) => call.method === 'GET')).toBe(true);
    } finally {
      download.mockRestore();
    }
  });

  it('reports invalid imports and leaves the catalogue available', async () => {
    const user = userEvent.setup();
    const api = createSkillsApi();
    const { router } = renderWorkspaceAt('/app/skills', api);
    await screen.findByRole('button', { name: 'Créer un skill' });
    await user.upload(
      screen.getByLabelText('Fichier Markdown ou ZIP'),
      new File(['---\nname: incomplete'], 'SKILL.md', { type: 'text/markdown' }),
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app/skills');
    expect(screen.getByRole('button', { name: 'Importer Markdown ou ZIP' })).toBeEnabled();
    expect(api.skillCalls.filter((call) => call.method === 'POST')).toHaveLength(0);
  });
  it('does not redirect when an import completes after leaving the catalogue', async () => {
    const user = userEvent.setup();
    let finish!: (value: Awaited<ReturnType<typeof skillPackage.importSkillPackage>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof skillPackage.importSkillPackage>>>(
      (resolve) => {
        finish = resolve;
      },
    );
    const importer = vi.spyOn(skillPackage, 'importSkillPackage').mockReturnValue(pending);
    try {
      const { router } = renderWorkspaceAt('/app/skills', createSkillsApi());
      await screen.findByRole('button', { name: 'Créer un skill' });
      await user.upload(
        screen.getByLabelText('Fichier Markdown ou ZIP'),
        new File(['# skill'], 'SKILL.md', { type: 'text/markdown' }),
      );
      await act(() => router.navigate('/app'));
      const destination = router.state.location.pathname;
      await act(async () => {
        finish(skillFixture());
        await pending;
      });
      expect(router.state.location.pathname).toBe(destination);
    } finally {
      importer.mockRestore();
    }
  });
});
