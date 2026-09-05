import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionContext, type SessionContextValue } from '@/contexts/session/session-context';
import { useAuthProvidersQuery } from '@/hooks/auth/use-auth-providers-query';
import { routes } from '@/routes/router';

vi.mock('@/hooks/auth/use-auth-providers-query');

const mockedUseAuthProvidersQuery = vi.mocked(useAuthProvidersQuery);

function renderRoute(path: string, session: SessionContextValue) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  return render(
    <SessionContext.Provider value={session}>
      <RouterProvider router={router} />
    </SessionContext.Provider>,
  );
}

const anonymousSession: SessionContextValue = {
  accessToken: null,
  logout: () => Promise.resolve(),
  refresh: () => Promise.resolve(null),
  status: 'anonymous',
  user: null,
};

describe('Alfred routes', () => {
  beforeEach(() => {
    mockedUseAuthProvidersQuery.mockReturnValue({
      providers: [],
      reload: vi.fn(),
      status: 'ready',
    });
  });

  it('redirects anonymous users away from the private workspace', async () => {
    renderRoute('/app', anonymousSession);

    expect(await screen.findByRole('heading', { name: /bienvenue sur alfred/i })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /message/i })).not.toBeInTheDocument();
  });

  it('renders the reusable workspace layout for an authenticated user', async () => {
    renderRoute('/app', {
      ...anonymousSession,
      accessToken: 'memory-only-token',
      status: 'authenticated',
      user: {
        displayName: 'Ada Lovelace',
        email: 'ada@example.test',
        id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
        role: 'user',
      },
    });

    expect(await screen.findByRole('navigation', { name: /navigation principale/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /nouvelle conversation/i })).toBeVisible();
    const composer = screen.getByRole('textbox', { name: /message/i });
    expect(composer).toBeVisible();
    expect(composer).toHaveClass('placeholder:text-muted');
    expect(composer).not.toHaveClass('placeholder:text-muted/80');
    expect(screen.getByText('Ada Lovelace')).toBeVisible();
  });
});
