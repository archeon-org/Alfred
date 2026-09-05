import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session: { status: 'anonymous' | 'authenticated' } = vi.hoisted(() => ({
  status: 'anonymous',
}));

vi.mock('./use-session', () => ({
  useSession: () => ({
    accessToken: null,
    logout: vi.fn(),
    refresh: vi.fn(),
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
});
