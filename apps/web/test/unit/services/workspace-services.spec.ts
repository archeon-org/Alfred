import { afterEach, describe, expect, it, vi } from 'vitest';

import { describeApiError } from '@/lib/workspace/api-error-message';
import { deriveConversationTitle } from '@/lib/workspace/derive-title';
import { formatDate } from '@/lib/workspace/format-date';
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  updateConversation,
  setConversationPinned,
} from '@/services/conversations/conversations.service';
import { ApiRequestError, withQuery } from '@/services/http/api-json';
import { createHttpClient } from '@/services/http/http-client';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from '@/services/projects/projects.service';
import { conversation, createWorkspaceApi, project, PROJECT_ID } from '../../support/workspace-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

function clientFor(
  api = createWorkspaceApi({ conversations: [conversation()], projects: [project()] }),
) {
  vi.stubGlobal('fetch', api.fetch);
  return { api, client: createHttpClient({ getAccessToken: () => 'token' }) };
}

describe('projects service', () => {
  it('lists, reads, creates, updates and deletes through validated envelopes', async () => {
    const { api, client } = clientFor();

    expect((await listProjects(client, { limit: 100 })).items.map(({ id }) => id)).toEqual([
      PROJECT_ID,
    ]);
    expect(api.calls[0]?.path).toBe('/api/projects?limit=100');
    expect((await getProject(client, PROJECT_ID)).name).toBe('Refonte du portail');

    const created = await createProject(client, { name: 'Atlas' }, 'key-1');
    expect(created.kind).toBe('named');
    const creation = api.calls.find(({ method }) => method === 'POST');
    expect(creation?.headers.get('idempotency-key')).toBe('key-1');
    expect(creation?.headers.get('authorization')).toBe('Bearer token');

    expect((await updateProject(client, created.id, { context: '# ctx' })).context).toBe('# ctx');
    await deleteProject(client, created.id);
    expect(api.projects.map(({ id }) => id)).toEqual([PROJECT_ID]);
  });

  it('surfaces the server business code and rejects malformed envelopes', async () => {
    const { api, client } = clientFor();
    api.fail('GET /api/projects/missing', 404, 'project_not_found');

    const error = await getProject(client, 'missing').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ code: 'project_not_found', status: 404 });

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ success: true, data: { id: 1 } }))),
      ),
    );
    await expect(listProjects(client)).rejects.toThrow('La liste des projets est invalide.');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('not json', { status: 500 }))),
    );
    await expect(listProjects(client)).rejects.toMatchObject({ code: 'HTTP_500' });
  });
});

describe('conversations service', () => {
  it('validates rename input and mutation responses, and surfaces failed pins', async () => {
    const { api, client } = clientFor();
    const id = conversation().id;
    await expect(updateConversation(client, id, { title: '' })).rejects.toThrow();
    expect(api.calls).toHaveLength(0);
    expect((await updateConversation(client, id, { title: 'Décisions' })).title).toBe('Décisions');
    expect((await setConversationPinned(client, id, true)).pinnedAt).not.toBeNull();
    expect((await setConversationPinned(client, id, false)).pinnedAt).toBeNull();
    api.fail(`POST /api/conversations/${id}/pin`, 404, 'conversation_not_found');
    await expect(setConversationPinned(client, id, true)).rejects.toMatchObject({
      code: 'conversation_not_found',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ success: true, data: { id } })))),
    );
    await expect(updateConversation(client, id, { title: 'Décisions' })).rejects.toThrow(
      'La conversation reçue est invalide.',
    );
  });

  it('scopes the list by project, creates with an idempotency key and deletes', async () => {
    const { api, client } = clientFor();

    const page = await listConversations(client, { limit: 50, projectId: PROJECT_ID });
    expect(page.items[0]?.projectKind).toBe('named');
    expect(api.calls[0]?.path).toBe(`/api/conversations?limit=50&projectId=${PROJECT_ID}`);
    expect((await getConversation(client, page.items[0]!.id)).title).toBe(
      'Synthèse du comité projet',
    );

    const standalone = await createConversation(client, {}, 'key-2');
    expect(standalone.projectKind).toBe('implicit');
    expect(api.calls.at(-1)?.headers.get('idempotency-key')).toBe('key-2');
    await deleteConversation(client, standalone.id);
    expect(api.conversations).toHaveLength(1);
  });
});

describe('workspace helpers', () => {
  it('builds query strings from defined string and number members only', () => {
    expect(withQuery('/projects', { cursor: undefined, limit: 20 })).toBe('/projects?limit=20');
    expect(withQuery('/projects', {})).toBe('/projects');
  });

  it('derives deterministic chat titles from a first message', () => {
    expect(deriveConversationTitle('\n  Peux-tu   résumer ?\nsuite')).toBe('Peux-tu résumer ?');
    expect(deriveConversationTitle('   ')).toBe('Nouvelle conversation');
    const long = deriveConversationTitle(`${'mot '.repeat(30)}fin`);
    expect(long.length).toBeLessThanOrEqual(72);
    expect(long.endsWith('…')).toBe(true);
    expect(deriveConversationTitle('a'.repeat(100))).toBe(`${'a'.repeat(71)}…`);
  });

  it('describes API failures in French and formats dates for lists', () => {
    expect(describeApiError(new ApiRequestError(404, 'project_not_found', 'x'), 'f')).toBe(
      'Ce projet n’existe plus.',
    );
    expect(describeApiError(new ApiRequestError(400, 'HTTP_400', 'x'), 'f')).toBe(
      'Les informations saisies sont invalides.',
    );
    expect(describeApiError(new ApiRequestError(500, 'HTTP_500', 'x'), 'fallback')).toBe(
      'fallback',
    );
    expect(describeApiError(new Error('Réseau'), 'f')).toBe('Réseau');
    expect(describeApiError('?', 'fallback')).toBe('fallback');
    expect(formatDate('2026-09-09T10:00:00.000Z')).toMatch(/2026/u);
    expect(formatDate('nope')).toBe('');
  });
});
