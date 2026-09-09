import type { Conversation, Project } from '@alfred/contracts';
import { vi } from 'vitest';

import { DISABLED_FEATURE_FLAGS } from '@/services/feature-flags/feature-flags';

export const PROJECT_ID = '0b6e1a9e-0a7f-4c26-9f5b-2f1a2c3d4e5f';
export const IMPLICIT_PROJECT_ID = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
export const CONVERSATION_ID = '3f2e1d0c-9b8a-4765-8321-fedcba987654';
export const STANDALONE_CONVERSATION_ID = '7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d';

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

export function project(overrides: Partial<Project> = {}): Project {
  return {
    archivedAt: null,
    context: null,
    createdAt: '2026-09-09T10:00:00.000Z',
    description: null,
    id: PROJECT_ID,
    kind: 'named',
    name: 'Refonte du portail',
    pinnedAt: null,
    status: 'active',
    updatedAt: '2026-09-09T10:00:00.000Z',
    ...overrides,
  };
}

export function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    archivedAt: null,
    createdAt: '2026-09-09T11:00:00.000Z',
    id: CONVERSATION_ID,
    lastActivityAt: null,
    projectId: PROJECT_ID,
    projectKind: 'named',
    title: 'Synthèse du comité projet',
    titleSource: 'user',
    updatedAt: '2026-09-09T11:00:00.000Z',
    ...overrides,
  };
}

export interface RecordedCall {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
  readonly headers: Headers;
}

interface Failure {
  readonly status: number;
  readonly code: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function failure(status: number, code: string, message = 'Request failed'): Response {
  return json({ error: { code, message }, success: false }, status);
}

function byDate<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((left, right) => key(right).localeCompare(key(left)));
}

/** In-memory stand-in for the projects and conversations API, driven through `fetch`. */
export function createWorkspaceApi(
  seed: {
    readonly projects?: readonly Project[];
    readonly conversations?: readonly Conversation[];
  } = {},
) {
  const projects: Project[] = [...(seed.projects ?? [])];
  const conversations: Conversation[] = [...(seed.conversations ?? [])];
  const calls: RecordedCall[] = [];
  const failures = new Map<string, Failure>();

  const route = (method: string, url: URL, body: unknown): Response => {
    const path = url.pathname;
    const failure_ = failures.get(`${method} ${path}`);
    if (failure_ !== undefined) return failure(failure_.status, failure_.code);
    if (path === '/api/features') return json({ data: DISABLED_FEATURE_FLAGS, success: true });
    if (path === '/api/auth/providers') return json({ data: [], success: true });
    if (path === '/api/projects' && method === 'GET') {
      const pinned = url.searchParams.get('pinned');
      const named = projects.filter((item) => item.kind === 'named' && item.status === 'active');
      if (pinned === 'true') {
        const items = [...named.filter((item) => item.pinnedAt !== null)].sort((left, right) =>
          (left.pinnedAt ?? '').localeCompare(right.pinnedAt ?? ''),
        );
        return json({ data: { items, nextCursor: null }, success: true });
      }
      const all = byDate(
        named.filter((item) => pinned !== 'false' || item.pinnedAt === null),
        (item) => item.updatedAt,
      );
      const offset = Number(url.searchParams.get('cursor') ?? '0');
      const limit = Number(url.searchParams.get('limit') ?? '20');
      const items = all.slice(offset, offset + limit);
      const nextCursor = offset + limit < all.length ? String(offset + limit) : null;
      return json({ data: { items, nextCursor }, success: true });
    }
    const pinMatch = /^\/api\/projects\/([^/]+)\/(pin|unpin)$/u.exec(path);
    if (pinMatch !== null && method === 'POST') {
      const index = projects.findIndex((item) => item.id === pinMatch[1]);
      if (index === -1) return failure(404, 'project_not_found', 'Project not found.');
      const current = projects[index]!;
      if (current.kind === 'implicit') return failure(409, 'project_implicit');
      const pinned = pinMatch[2] === 'pin';
      if ((current.pinnedAt !== null) !== pinned) {
        projects[index] = {
          ...current,
          pinnedAt: pinned ? new Date().toISOString() : null,
          updatedAt: new Date().toISOString(),
        };
      }
      return json({ data: projects[index], success: true });
    }
    if (path === '/api/projects' && method === 'POST') {
      const input = body as { name?: unknown; description?: unknown; context?: unknown };
      if (typeof input.name !== 'string' || input.name.trim() === '') {
        return json(
          { error: { code: 'HTTP_400', message: ['name must be longer'] }, success: false },
          400,
        );
      }
      const created = project({
        context: typeof input.context === 'string' ? input.context : null,
        createdAt: new Date().toISOString(),
        description: typeof input.description === 'string' ? input.description : null,
        id: nextId(),
        name: input.name.trim(),
        updatedAt: new Date().toISOString(),
      });
      projects.push(created);
      return json({ data: created, success: true }, 201);
    }
    const projectMatch = /^\/api\/projects\/([^/]+)$/u.exec(path);
    if (projectMatch !== null) {
      const index = projects.findIndex((item) => item.id === projectMatch[1]);
      if (index === -1) return failure(404, 'project_not_found', 'Project not found.');
      const current = projects[index]!;
      if (method === 'GET') return json({ data: current, success: true });
      if (method === 'PATCH') {
        const changes = body as { name?: unknown; description?: unknown; context?: unknown };
        if (Object.values(changes).every((value) => value === undefined)) {
          return failure(400, 'invalid_update');
        }
        const text = (value: unknown) =>
          typeof value === 'string' ? (value.trim() === '' ? null : value) : undefined;
        const updated: Project = {
          ...current,
          ...(typeof changes.name === 'string' ? { name: changes.name.trim() } : {}),
          ...(text(changes.description) === undefined
            ? {}
            : { description: text(changes.description) ?? null }),
          ...(text(changes.context) === undefined
            ? {}
            : { context: text(changes.context) ?? null }),
          updatedAt: new Date().toISOString(),
        };
        projects[index] = updated;
        return json({ data: updated, success: true });
      }
      if (method === 'DELETE') {
        projects.splice(index, 1);
        for (let cursor = conversations.length - 1; cursor >= 0; cursor -= 1) {
          if (conversations[cursor]?.projectId === current.id) conversations.splice(cursor, 1);
        }
        return new Response(null, { status: 204 });
      }
    }
    if (path === '/api/conversations' && method === 'GET') return json({ data: null });
    if (path === '/api/conversations' && method === 'POST') {
      const input = body as { projectId?: unknown; title?: unknown };
      let parent: Project | undefined;
      if (typeof input.projectId === 'string') {
        parent = projects.find((item) => item.id === input.projectId);
        if (parent === undefined) return failure(404, 'project_not_found', 'Project not found.');
        if (parent.kind === 'implicit') return failure(409, 'project_implicit');
      } else {
        parent = project({ id: nextId(), kind: 'implicit', name: null });
        projects.push(parent);
      }
      const title =
        typeof input.title === 'string' && input.title.trim() !== '' ? input.title.trim() : null;
      const created = conversation({
        createdAt: new Date().toISOString(),
        id: nextId(),
        projectId: parent.id,
        projectKind: parent.kind,
        title: title ?? 'Nouvelle conversation',
        titleSource: title === null ? 'none' : 'user',
        updatedAt: new Date().toISOString(),
      });
      conversations.push(created);
      return json({ data: created, success: true }, 201);
    }
    const conversationMatch = /^\/api\/conversations\/([^/]+)$/u.exec(path);
    if (conversationMatch !== null) {
      const index = conversations.findIndex((item) => item.id === conversationMatch[1]);
      if (index === -1) return failure(404, 'conversation_not_found', 'Conversation not found.');
      if (method === 'GET') return json({ data: conversations[index], success: true });
      if (method === 'DELETE') {
        conversations.splice(index, 1);
        return new Response(null, { status: 204 });
      }
    }
    return failure(404, 'HTTP_404', 'Not found');
  };

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    );
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({
      body,
      headers: new Headers(init?.headers),
      method,
      path: url.pathname + url.search,
    });
    await Promise.resolve();
    if (url.pathname === '/api/conversations' && method === 'GET') {
      const projectId = url.searchParams.get('projectId');
      if (projectId !== null && !projects.some((item) => item.id === projectId)) {
        return failure(404, 'project_not_found', 'Project not found.');
      }
      const failure_ = failures.get('GET /api/conversations');
      if (failure_ !== undefined) return failure(failure_.status, failure_.code);
      const items = byDate(
        conversations.filter((item) => projectId === null || item.projectId === projectId),
        (item) => item.createdAt,
      );
      return json({ data: { items, nextCursor: null }, success: true });
    }
    return route(method, url, body);
  });

  return {
    calls,
    conversations,
    /** Make the next responses of `METHOD /api/path` fail with a status and business code. */
    fail(request: string, status: number, code = `HTTP_${status}`) {
      failures.set(request, { code, status });
    },
    fetch,
    projects,
    recover() {
      failures.clear();
    },
  };
}
