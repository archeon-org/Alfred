import { afterEach, expect, it, vi } from 'vitest';
import { createHttpClient } from '@/services/http/http-client';
import { getCurrentWorkspaces } from '@/services/workspaces/workspaces.service';
import { createWorkspaceApi } from '../../support/workspace-api';

afterEach(() => vi.unstubAllGlobals());

it('gets only the current user membership with the authenticated client', async () => {
  const api = createWorkspaceApi();
  vi.stubGlobal('fetch', api.fetch);
  const membership = await getCurrentWorkspaces(
    createHttpClient({ getAccessToken: () => 'token' }),
  );
  expect(membership.workspaces[0]?.name).toBe('Équipe produit');
  expect(api.calls[0]).toMatchObject({ method: 'GET', path: '/api/users/me/workspaces' });
  expect(api.calls[0]?.headers.get('authorization')).toBe('Bearer token');
});

it.each([
  {
    tenant: { id: 'invalid', name: 'Acme' },
    workspaces: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Team' }],
  },
  { tenant: { id: '11111111-1111-4111-8111-111111111111', name: ' ' }, workspaces: [] },
  {
    tenant: { id: '11111111-1111-4111-8111-111111111111', name: 'Acme' },
    workspaces: [{ id: 'invalid', name: 'Team' }],
  },
  {
    tenant: { id: '11111111-1111-4111-8111-111111111111', name: 'Acme' },
    workspaces: [{ id: '11111111-1111-4111-8111-111111111111', name: ' ' }],
  },
])('rejects invalid membership data', async (data) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data }))),
  );
  await expect(getCurrentWorkspaces(createHttpClient())).rejects.toThrow(
    'L’organisation ou les équipes reçues sont invalides.',
  );
});

it.each(['tenant', 'workspace'])('rejects %s names beyond the database limit', async (scope) => {
  const valid = { id: '11111111-1111-4111-8111-111111111111', name: 'Team' };
  const longName = { ...valid, name: 'x'.repeat(161) };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            tenant: scope === 'tenant' ? longName : valid,
            workspaces: [scope === 'workspace' ? longName : valid],
          },
        }),
      ),
    ),
  );
  await expect(getCurrentWorkspaces(createHttpClient())).rejects.toThrow(
    'L’organisation ou les équipes reçues sont invalides.',
  );
});
