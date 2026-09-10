import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SkillsPanel } from '@/components/workspace/context/skills-panel';
import { SessionContext } from '@/contexts/session/session-context';
import { authenticatedSession, createTestQueryClient } from '../../support/render-workspace';
import { createSkillsApi, skillFixture, SKILL_ID } from '../../support/skills-api';

function panel(path: string, api: ReturnType<typeof createSkillsApi>) {
  vi.stubGlobal('fetch', api.fetch);
  const router = createMemoryRouter(
    [
      { path: '/conversations/:conversationId', element: <SkillsPanel /> },
      { path: '/', element: <SkillsPanel /> },
    ],
    { initialEntries: [path] },
  );
  const queryClient = createTestQueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={authenticatedSession}>
        <RouterProvider router={router} />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}
describe('Global skills catalogue panel', () => {
  it.each(['/', '/conversations/conversation-one'])(
    'shows the same global catalogue at %s without binding requests',
    async (path) => {
      const api = createSkillsApi([skillFixture({ publishedVersion: 1, status: 'published' })]);
      panel(path, api);
      expect(await screen.findByRole('link', { name: 'synthese' })).toHaveAttribute(
        'href',
        `/app/skills/${SKILL_ID}/edit`,
      );
      expect(screen.queryByRole('button', { name: /Ajouter|Retirer/ })).not.toBeInTheDocument();
      for (const [input] of api.fetch.mock.calls)
        expect(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        ).not.toMatch(/conversations.*skills/);
    },
  );
  it('hides disabled and unpublished skills from the available catalogue', async () => {
    panel(
      '/',
      createSkillsApi([
        skillFixture(),
        skillFixture({
          id: '00000000-0000-4000-8000-000000000002',
          enabled: false,
          publishedVersion: 1,
        }),
      ]),
    );
    expect(await screen.findByText('Aucun skill actif et publié.')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'synthese' })).not.toBeInTheDocument();
  });
});
