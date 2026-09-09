import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';

import { SessionContext, type SessionContextValue } from '@/contexts/session/session-context';
import { routes } from '@/routes/router';
import { createWorkspaceApi } from './workspace-api';

export const authenticatedSession: SessionContextValue = {
  accessToken: 'memory-only-test-token',
  logout: () => Promise.resolve(),
  refresh: () => Promise.resolve(null),
  status: 'authenticated',
  user: {
    displayName: 'Ada Lovelace',
    email: 'ada@example.test',
    id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
    role: 'user',
  },
};

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: 0, retry: false },
    },
  });
}

/** Renders the real routes at `path` against the in-memory workspace API. */
export function renderWorkspaceAt(
  path: string,
  api: ReturnType<typeof createWorkspaceApi> = createWorkspaceApi(),
  session: SessionContextValue = authenticatedSession,
) {
  vi.stubGlobal('fetch', api.fetch);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <QueryClientProvider client={createTestQueryClient()}>
      <SessionContext.Provider value={session}>
        <RouterProvider router={router} />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  return { ...view, api, router };
}
