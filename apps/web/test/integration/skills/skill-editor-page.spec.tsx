import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWorkspaceAt } from '../../support/render-workspace';
import { createSkillsApi, skillFixture, SKILL_ID } from '../../support/skills-api';

describe('Skill editor page', () => {
  it('opens creation on a dedicated route without a modal', async () => {
    const user = userEvent.setup();
    const { router } = renderWorkspaceAt('/app/skills', createSkillsApi());
    await user.click(await screen.findByRole('button', { name: 'Créer un skill' }));
    expect(router.state.location.pathname).toBe('/app/skills/new');
    expect(await screen.findByRole('heading', { name: 'Créer un skill', level: 1 })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /le contexte/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Votre atelier')).not.toBeInTheDocument();
  });

  it('loads an existing package from a direct URL and preserves a draft when navigation is canceled', async () => {
    const user = userEvent.setup();
    const { router } = renderWorkspaceAt(
      `/app/skills/${SKILL_ID}/edit`,
      createSkillsApi([skillFixture()]),
    );
    const text = await screen.findByRole('textbox', { name: 'Contenu de SKILL.md' });
    await user.type(text, '\nMon changement');
    await user.click(
      within(screen.getByRole('navigation', { name: 'Fil d’Ariane' })).getByRole('link', {
        name: 'Mes skills',
      }),
    );
    const confirmation = await screen.findByRole('alertdialog');
    await user.click(within(confirmation).getByRole('button', { name: 'Annuler' }));
    expect(text).toHaveValue('# Synthese\nMon changement');
    expect(router.state.location.pathname).toBe(`/app/skills/${SKILL_ID}/edit`);
    await user.click(
      within(screen.getByRole('navigation', { name: 'Fil d’Ariane' })).getByRole('link', {
        name: 'Mes skills',
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Quitter sans enregistrer' }));
    expect(await screen.findByRole('heading', { name: 'Mes skills' })).toBeVisible();
  });

  it('keeps the original optimistic version when cached server data changes during editing', async () => {
    const user = userEvent.setup();
    const api = createSkillsApi([skillFixture()]);
    const { queryClient } = renderWorkspaceAt(`/app/skills/${SKILL_ID}/edit`, api);
    const text = await screen.findByRole('textbox', { name: 'Contenu de SKILL.md' });
    await user.type(text, ' local');
    await act(() =>
      queryClient.setQueriesData(
        { queryKey: ['skills'], predicate: (query) => query.queryKey.includes('detail') },
        skillFixture({ version: 99 }),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(await screen.findByRole('heading', { name: 'Mes skills' })).toBeVisible();
    expect(api.skillCalls.find((call) => call.method === 'PUT')?.body).toEqual(
      expect.objectContaining({ expectedVersion: 1 }),
    );
  });

  it('does not request the package when skills are disabled on a direct URL', async () => {
    const api = createSkillsApi([], false);
    renderWorkspaceAt(`/app/skills/${SKILL_ID}/edit`, api);
    expect(await screen.findByText('Le catalogue de skills est désactivé.')).toBeVisible();
    expect(api.skillCalls).toHaveLength(0);
  });
});
