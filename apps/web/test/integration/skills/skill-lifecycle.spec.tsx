import { act, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWorkspaceAt } from '../../support/render-workspace';
import { createSkillsApi, skillFixture, SKILL_ID } from '../../support/skills-api';

const old = skillFixture({
  name: 'ancienne',
  files: [{ path: 'SKILL.md', contentBase64: btoa('# Ancienne'), mediaType: 'text/markdown' }],
});
const current = skillFixture({
  version: 3,
  currentVersion: 2,
  publishedVersion: 2,
  status: 'published',
});
function setup() {
  const api = createSkillsApi([current], true, [old, current]);
  renderWorkspaceAt(`/app/skills/${SKILL_ID}/edit`, api);
  return api;
}
describe('Skill lifecycle in the editor', () => {
  it('confirms rollback, selects the existing snapshot and saves with its new optimistic version', async () => {
    const user = userEvent.setup();
    const api = setup();
    const source = await screen.findByRole('textbox', { name: 'Contenu de SKILL.md' });
    await user.type(source, ' local');
    await user.click(screen.getByRole('button', { name: 'Historique des versions' }));
    await user.click(await screen.findByRole('button', { name: 'Restaurer la version 1' }));
    let dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(source).toHaveValue('# Synthese local');
    await user.click(screen.getByRole('button', { name: 'Restaurer la version 1' }));
    dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Restaurer cette version' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Contenu de SKILL.md' })).toHaveValue(
        '# Ancienne',
      ),
    );
    expect(screen.getByRole('textbox', { name: 'Nom du skill' })).toHaveValue('ancienne');
    expect(screen.getByText(/Version 1 restaurée/)).toBeVisible();
    expect(screen.getByText(/Brouillon v1/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Historique des versions' }));
    expect(await screen.findByText('Version 1 · Courante')).toBeVisible();
    expect(screen.queryByText(/Version 3/)).not.toBeInTheDocument();
    expect(
      api.skillCalls.some(
        (call) =>
          JSON.stringify(call.body) === JSON.stringify({ expectedVersion: 3, sourceVersion: 1 }),
      ),
    ).toBe(true);
    await user.type(screen.getByRole('textbox', { name: 'Contenu de SKILL.md' }), ' suite');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(await screen.findByRole('heading', { name: 'Mes skills' })).toBeVisible();
    expect(api.skillCalls.filter((call) => call.method === 'PUT').at(-1)?.body).toEqual(
      expect.objectContaining({ expectedVersion: 4 }),
    );
  });
  it('publishes the saved version from the editor and guards unsaved content', async () => {
    const user = userEvent.setup();
    const api = createSkillsApi([skillFixture()]);
    renderWorkspaceAt(`/app/skills/${SKILL_ID}/edit`, api);
    const publish = await screen.findByRole('button', { name: 'Publier' });
    const source = screen.getByRole('textbox', { name: 'Contenu de SKILL.md' });
    await user.type(source, ' local');
    expect(publish).toBeDisabled();
    await user.clear(source);
    await user.type(source, '# Synthese');
    expect(publish).toBeEnabled();
    await user.click(publish);
    expect(await screen.findByText('Version 1 publiée.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publiée' })).toBeDisabled();
    expect(api.skillCalls.filter((call) => call.method === 'POST').at(-1)?.body).toEqual({
      expectedVersion: 1,
    });
    expect(source).toHaveValue('# Synthese');
  });
  it('disables and re-enables a skill in the editor while retaining unsaved text', async () => {
    const user = userEvent.setup();
    const api = setup();
    const source = await screen.findByRole('textbox', { name: 'Contenu de SKILL.md' });
    await user.type(source, ' local');
    await user.click(screen.getByRole('button', { name: 'Désactiver le skill' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Désactiver' }),
    );
    expect(await screen.findByRole('button', { name: 'Activer le skill' })).toBeEnabled();
    expect(source).toHaveValue('# Synthese local');
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Activer le skill' }));
    expect(await screen.findByRole('button', { name: 'Désactiver le skill' })).toBeEnabled();
    expect(api.skillCalls.filter((call) => call.method === 'PUT').map((call) => call.body)).toEqual(
      [
        { expectedVersion: 3, enabled: false },
        { expectedVersion: 4, enabled: true },
      ],
    );
  });
  it('preserves local content when restoring hits a version conflict', async () => {
    const user = userEvent.setup();
    const api = setup();
    const source = await screen.findByRole('textbox', { name: 'Contenu de SKILL.md' });
    await user.type(source, ' local');
    api.setConflict();
    await user.click(screen.getByRole('button', { name: 'Historique des versions' }));
    await user.click(await screen.findByRole('button', { name: 'Restaurer la version 1' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Restaurer cette version',
      }),
    );
    expect(await screen.findByText(/modifié ailleurs/)).toBeVisible();
    expect(source).toHaveValue('# Synthese local');
  });
  it('keeps the local draft mounted after a background detail refresh fails', async () => {
    const user = userEvent.setup();
    const api = createSkillsApi([current]);
    const { queryClient } = renderWorkspaceAt(`/app/skills/${SKILL_ID}/edit`, api);
    const source = await screen.findByRole('textbox', { name: 'Contenu de SKILL.md' });
    await user.type(source, ' local');
    const original = api.fetch.getMockImplementation()!;
    api.fetch.mockImplementation((input, init) =>
      (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).endsWith(
        `/skills/${SKILL_ID}`,
      ) &&
      (!init?.method || init.method === 'GET')
        ? Promise.resolve(new Response('{}', { status: 503 }))
        : original(input, init),
    );
    await act(() => queryClient.invalidateQueries({ queryKey: ['skills'] }));
    expect(screen.getByRole('textbox', { name: 'Contenu de SKILL.md' })).toBe(source);
    expect(source).toHaveValue('# Synthese local');
    expect(await screen.findByText(/Actualisation impossible/)).toBeVisible();
  });
  it('protects page reloads while a clean draft has an availability operation pending', async () => {
    const user = userEvent.setup();
    const api = setup();
    const source = await screen.findByRole('textbox', { name: 'Contenu de SKILL.md' });
    const original = api.fetch.getMockImplementation()!;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    api.fetch.mockImplementation(async (input, init) => {
      if (
        (typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
        ).endsWith('/availability')
      )
        await blocked;
      return original(input, init);
    });
    await user.click(screen.getByRole('button', { name: 'Désactiver le skill' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Désactiver' }),
    );
    expect(source).toBeDisabled();
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
    await act(async () => {
      release();
      await blocked;
    });
    await screen.findByRole('button', { name: 'Activer le skill' });
  });
});
