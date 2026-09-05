import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const session: { status: 'anonymous' | 'authenticated' | 'error' } = vi.hoisted(() => ({
  status: 'anonymous',
}));

vi.mock('./use-session', () => ({
  useSession: () => ({
    accessToken: null,
    logout: vi.fn(),
    refresh,
    user: null,
    ...session,
  }),
}));

vi.mock('../features/use-feature-flags', () => ({
  useFeatureFlags: () => ({
    flags: { googleOAuth: true },
    reload: vi.fn(),
    status: 'ready',
  }),
}));

import { LoginPage } from './login-page';

describe('LoginPage return path', () => {
  beforeEach(() => {
    session.status = 'anonymous';
    refresh.mockClear();
  });

  it('forwards the protected route to the OAuth start endpoint', () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/login', state: { from: '/app/team?tab=agents#selection' } }]}
      >
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /continuer avec Google/i })).toHaveAttribute(
      'href',
      '/api/auth/google/start?returnTo=%2Fapp%2Fteam%3Ftab%3Dagents%23selection',
    );
  });

  it('returns an already authenticated user to the originally requested route', () => {
    session.status = 'authenticated';
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/app/team' } }]}>
        <Routes>
          <Route element={<LoginPage />} path="/login" />
          <Route element={<h1>Team destination</h1>} path="/app/team" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Team destination' })).toBeVisible();
  });

  it('offers a retry without exposing login controls during a session outage', () => {
    session.status = 'error';
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/vérifier votre session/u);
    expect(screen.queryByRole('link', { name: /continuer avec google/u })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /réessayer/iu }));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
