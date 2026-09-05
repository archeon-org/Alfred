import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionContext, type SessionContextValue } from '@/contexts/session/session-context';
import { useAuthProvidersQuery } from '@/hooks/auth/use-auth-providers-query';
import { routes } from '@/routes/router';

vi.mock('@/hooks/auth/use-auth-providers-query');

const mockedUseAuthProvidersQuery = vi.mocked(useAuthProvidersQuery);

const anonymousSession: SessionContextValue = {
  accessToken: null,
  logout: () => Promise.resolve(),
  refresh: () => Promise.resolve(null),
  status: 'anonymous',
  user: null,
};

const restoredSession = {
  accessToken: 'restored-token',
  user: {
    displayName: 'Ada Lovelace',
    email: 'ada@example.test',
    id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
    role: 'user' as const,
  },
};

type AuthProvidersState = ReturnType<typeof useAuthProvidersQuery>;

const noAuthProviders: AuthProvidersState = {
  providers: [],
  reload: () => Promise.resolve(),
  status: 'ready',
};

function renderRoute(
  path: string,
  session: SessionContextValue,
  authProviders: AuthProvidersState = noAuthProviders,
) {
  mockedUseAuthProvidersQuery.mockReturnValue(authProviders);
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  render(
    <SessionContext.Provider value={session}>
      <RouterProvider router={router} />
    </SessionContext.Provider>,
  );

  return router;
}

describe('Alfred protected route behavior', () => {
  beforeEach(() => {
    mockedUseAuthProvidersQuery.mockReturnValue(noAuthProviders);
  });

  it('keeps private content hidden while the session is hydrating', () => {
    renderRoute('/app', { ...anonymousSession, status: 'loading' });

    expect(screen.getByRole('status')).toHaveTextContent(/restauration de votre session/i);
    expect(screen.queryByRole('textbox', { name: /message/i })).not.toBeInTheDocument();
  });

  it('renders every provider advertised by the server', async () => {
    renderRoute('/login', anonymousSession, {
      ...noAuthProviders,
      providers: [
        { displayName: 'Google', id: 'google' },
        { displayName: 'Microsoft', id: 'microsoft' },
      ],
    });

    expect(await screen.findByRole('link', { name: /continuer avec google/i })).toHaveAttribute(
      'href',
      '/api/auth/providers/google/start?returnTo=%2Fapp',
    );
    expect(screen.getByRole('link', { name: /continuer avec microsoft/i })).toHaveAttribute(
      'href',
      '/api/auth/providers/microsoft/start?returnTo=%2Fapp',
    );
  });

  it('waits for the provider manifest before exposing a configured login provider', () => {
    renderRoute('/login', anonymousSession, {
      ...noAuthProviders,
      providers: [{ displayName: 'Google', id: 'google' }],
      status: 'loading',
    });

    expect(screen.getByRole('status')).toHaveTextContent(/vérification de la connexion/i);
    expect(screen.queryByRole('link', { name: /continuer avec google/i })).not.toBeInTheDocument();
  });

  it('explains when no login provider is configured', async () => {
    renderRoute('/login', anonymousSession);

    expect(
      await screen.findByText(/Aucun fournisseur de connexion n’est configuré/i),
    ).toBeVisible();
    expect(screen.queryByRole('link', { name: /continuer avec Google/i })).not.toBeInTheDocument();
  });

  it('shows a recoverable error when auth configuration is unavailable', async () => {
    renderRoute('/login', anonymousSession, { ...noAuthProviders, status: 'error' });

    expect(await screen.findByRole('alert')).toHaveTextContent(/impossible de vérifier/i);
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeVisible();
  });

  it('shows a retryable session outage without presenting the visitor as anonymous', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('offline'));
    renderRoute('/app', { ...anonymousSession, refresh, status: 'error' });

    expect(await screen.findByRole('alert')).toHaveTextContent(/restaurer votre session/i);
    expect(
      screen.queryByRole('heading', { name: /bienvenue sur alfred/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /réessayer/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it('finishes the OAuth callback by refreshing before entering the workspace', async () => {
    const refresh = vi.fn().mockResolvedValue(restoredSession);
    const router = renderRoute('/auth/callback', { ...anonymousSession, refresh });

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'));
  });

  it('reports a rejected callback without exposing provider details', async () => {
    const refresh = vi.fn().mockResolvedValue(restoredSession);

    renderRoute('/auth/callback?error=access_denied', { ...anonymousSession, refresh });

    expect(await screen.findByRole('heading', { name: /connexion non finalisée/i })).toBeVisible();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText('access_denied')).not.toBeInTheDocument();
  });

  it('keeps the workspace open and reports an unconfirmed logout', async () => {
    const logout = vi.fn().mockRejectedValue(new Error('offline'));
    renderRoute('/app', {
      ...anonymousSession,
      accessToken: 'short-lived-token',
      logout,
      status: 'authenticated',
      user: restoredSession.user,
    });

    fireEvent.click(screen.getByRole('button', { name: /se déconnecter/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/session reste active/i);
    expect(logout).toHaveBeenCalledOnce();
    expect(screen.getByText('Ada Lovelace')).toBeVisible();
  });

  it('renders a useful not-found route', async () => {
    renderRoute('/route-inconnue', anonymousSession);

    expect(await screen.findByRole('heading', { name: /cette page n’existe pas/i })).toBeVisible();
    expect(screen.getByRole('link', { name: /retour à l’accueil/i })).toHaveAttribute('href', '/');
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });
});
