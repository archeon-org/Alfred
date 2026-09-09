import type { Page, Route } from '@playwright/test';

export const PROJECT_ID = '0b6e1a9e-0a7f-4c26-9f5b-2f1a2c3d4e5f';
export const CONVERSATION_ID = '3f2e1d0c-9b8a-4765-8321-fedcba987654';

interface ProjectRecord {
  id: string;
  kind: 'implicit' | 'named';
  name: string | null;
  description: string | null;
  context: string | null;
  status: 'active';
  createdAt: string;
  updatedAt: string;
  archivedAt: null;
  pinnedAt: string | null;
}

interface ConversationRecord {
  id: string;
  projectId: string;
  projectKind: 'implicit' | 'named';
  title: string;
  titleSource: 'none' | 'user';
  lastActivityAt: null;
  createdAt: string;
  updatedAt: string;
  archivedAt: null;
}

export interface WorkspaceSeed {
  readonly projects: readonly ProjectRecord[];
  readonly conversations: readonly ConversationRecord[];
}

export function defaultSeed(): WorkspaceSeed {
  return {
    conversations: [
      {
        archivedAt: null,
        createdAt: '2026-09-09T11:00:00.000Z',
        id: CONVERSATION_ID,
        lastActivityAt: null,
        projectId: PROJECT_ID,
        projectKind: 'named',
        title: 'Synthèse du comité projet',
        titleSource: 'user',
        updatedAt: '2026-09-09T11:00:00.000Z',
      },
    ],
    projects: [
      {
        archivedAt: null,
        context: null,
        createdAt: '2026-09-09T10:00:00.000Z',
        description: 'Un espace pour penser la prochaine version.',
        id: PROJECT_ID,
        kind: 'named',
        name: 'Refonte du portail',
        pinnedAt: null,
        status: 'active',
        updatedAt: '2026-09-09T10:00:00.000Z',
      },
    ],
  };
}

/** Browser-side stand-in for the projects and conversations API, backed by an in-memory store. */
export async function installWorkspaceApi(page: Page, seed: WorkspaceSeed = defaultSeed()) {
  const projects: ProjectRecord[] = seed.projects.map((item) => ({ ...item }));
  const conversations: ConversationRecord[] = seed.conversations.map((item) => ({ ...item }));
  let counter = 0;
  const nextId = () => {
    counter += 1;
    return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  };
  const json = (route: Route, status: number, body?: unknown) =>
    route.fulfill({
      body: body === undefined ? '' : JSON.stringify(body),
      contentType: 'application/json',
      status,
    });
  const notFound = (route: Route, code: string) =>
    json(route, 404, { error: { code, message: 'Not found.' }, success: false });
  const body = (route: Route): Record<string, unknown> => {
    const raw = route.request().postData();
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  };
  const now = () => new Date().toISOString();

  await page.route('**/api/projects**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const pinMatch = /^\/api\/projects\/([^/]+)\/(pin|unpin)$/u.exec(url.pathname);
    if (pinMatch !== null && method === 'POST') {
      const index = projects.findIndex((item) => item.id === pinMatch[1]);
      if (index === -1) return notFound(route, 'project_not_found');
      const current = projects[index]!;
      const pinned = pinMatch[2] === 'pin';
      if ((current.pinnedAt !== null) !== pinned) {
        projects[index] = { ...current, pinnedAt: pinned ? now() : null, updatedAt: now() };
      }
      return json(route, 200, { data: projects[index], success: true });
    }
    const match = /^\/api\/projects(?:\/([^/]+))?$/u.exec(url.pathname);
    const id = match?.[1];
    if (id === undefined && method === 'GET') {
      const pinned = url.searchParams.get('pinned');
      const named = projects.filter((item) => item.kind === 'named');
      if (pinned === 'true') {
        const items = named
          .filter((item) => item.pinnedAt !== null)
          .sort((left, right) => (left.pinnedAt ?? '').localeCompare(right.pinnedAt ?? ''));
        return json(route, 200, { data: { items, nextCursor: null }, success: true });
      }
      const all = named
        .filter((item) => pinned !== 'false' || item.pinnedAt === null)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      const offset = Number(url.searchParams.get('cursor') ?? '0');
      const limit = Number(url.searchParams.get('limit') ?? '20');
      const items = all.slice(offset, offset + limit);
      const nextCursor = offset + limit < all.length ? String(offset + limit) : null;
      return json(route, 200, { data: { items, nextCursor }, success: true });
    }
    if (id === undefined && method === 'POST') {
      const input = body(route);
      const created: ProjectRecord = {
        archivedAt: null,
        context: null,
        createdAt: now(),
        description: null,
        id: nextId(),
        kind: 'named',
        name: typeof input.name === 'string' ? input.name.trim() : '',
        pinnedAt: null,
        status: 'active',
        updatedAt: now(),
      };
      projects.push(created);
      return json(route, 201, { data: created, success: true });
    }
    const index = projects.findIndex((item) => item.id === id);
    if (index === -1) return notFound(route, 'project_not_found');
    if (method === 'GET') return json(route, 200, { data: projects[index], success: true });
    if (method === 'PATCH') {
      const changes = body(route);
      const current = projects[index]!;
      const updated: ProjectRecord = {
        ...current,
        ...(typeof changes.name === 'string' ? { name: changes.name.trim() } : {}),
        ...(typeof changes.description === 'string'
          ? { description: changes.description.trim() === '' ? null : changes.description }
          : {}),
        ...(typeof changes.context === 'string'
          ? { context: changes.context.trim() === '' ? null : changes.context }
          : {}),
        updatedAt: now(),
      };
      projects[index] = updated;
      return json(route, 200, { data: updated, success: true });
    }
    if (method === 'DELETE') {
      const [removed] = projects.splice(index, 1);
      for (let cursor = conversations.length - 1; cursor >= 0; cursor -= 1) {
        if (conversations[cursor]?.projectId === removed?.id) conversations.splice(cursor, 1);
      }
      return route.fulfill({ status: 204 });
    }
    return route.fallback();
  });

  await page.route('**/api/conversations**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const match = /^\/api\/conversations(?:\/([^/]+))?$/u.exec(url.pathname);
    const id = match?.[1];
    if (id === undefined && method === 'GET') {
      const projectId = url.searchParams.get('projectId');
      const items = conversations
        .filter((item) => projectId === null || item.projectId === projectId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      return json(route, 200, { data: { items, nextCursor: null }, success: true });
    }
    if (id === undefined && method === 'POST') {
      const input = body(route);
      let parent = projects.find((item) => item.id === input.projectId);
      if (typeof input.projectId === 'string' && parent === undefined) {
        return notFound(route, 'project_not_found');
      }
      if (parent === undefined) {
        parent = {
          archivedAt: null,
          context: null,
          createdAt: now(),
          description: null,
          id: nextId(),
          kind: 'implicit',
          name: null,
          pinnedAt: null,
          status: 'active',
          updatedAt: now(),
        };
        projects.push(parent);
      }
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      const created: ConversationRecord = {
        archivedAt: null,
        createdAt: now(),
        id: nextId(),
        lastActivityAt: null,
        projectId: parent.id,
        projectKind: parent.kind,
        title: title === '' ? 'Nouvelle conversation' : title,
        titleSource: title === '' ? 'none' : 'user',
        updatedAt: now(),
      };
      conversations.push(created);
      return json(route, 201, { data: created, success: true });
    }
    const index = conversations.findIndex((item) => item.id === id);
    if (index === -1) return notFound(route, 'conversation_not_found');
    if (method === 'GET') return json(route, 200, { data: conversations[index], success: true });
    if (method === 'DELETE') {
      conversations.splice(index, 1);
      return route.fulfill({ status: 204 });
    }
    return route.fallback();
  });
}
