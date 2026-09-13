import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RouteErrorScreen, WorkspaceErrorScreen } from '@/screens/errors/route-error-screen';

function Boom(): never {
  throw new Error('openCreation is not defined');
}

function renderWithError(errorElement: React.ReactElement, path = '/app') {
  const router = createMemoryRouter([{ element: <Boom />, errorElement, path }], {
    initialEntries: [path],
  });
  return render(<RouterProvider router={router} />);
}

describe('route error screens', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders a full-page fallback with a way home instead of the raw stack', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderWithError(<RouteErrorScreen />);

    expect(screen.getByRole('alert')).toHaveTextContent('Une erreur est survenue');
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute(
      'href',
      '/app',
    );
    expect(screen.getByRole('button', { name: 'Recharger la page' })).toBeInTheDocument();
  });

  it('renders the in-frame fallback for workspace screens', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderWithError(<WorkspaceErrorScreen />, '/app/settings');

    expect(screen.getByRole('alert')).toHaveTextContent('Une erreur est survenue');
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toBeInTheDocument();
  });
});
