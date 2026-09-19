import { encodeAgUiFrames, synthesizeRun, type AgUiFrame } from './ag-ui-synth';
import type {
  Conversation,
  ExecutionSnapshot,
  FeatureFlags,
  Message,
  MessageAttachment,
  Project,
} from '@alfred/contracts';
import { vi } from 'vitest';

import { DISABLED_FEATURE_FLAGS } from '@/services/feature-flags/feature-flags';

export const TENANT_ID = 'a16b7db5-d522-4945-887d-346ea0a2fe2a';
export const SECOND_WORKSPACE_ID = '1a8d7bf6-69a3-461e-87d2-26f4f2ef1dcb';
export const WORKSPACE_ID = 'cbb19b92-f070-48db-8252-568f2dc0c67f';
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
    pinnedAt: null,
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

/** AG-UI batches: the attach batch, then the frames of each committed change. */
type SseFrames = readonly (readonly AgUiFrame[])[];

const SSE_HEADERS = { 'content-type': 'text/event-stream' };

function encodeFrames(batches: SseFrames): string {
  return batches.map((frames) => encodeAgUiFrames(frames)).join('');
}

/**
 * Streams `batches`; with `hold`, the attach batch (state and running execution) goes out at
 * once and the rest waits for the promise, so tests can observe an answer in progress.
 */
function sseResponse(batches: SseFrames, hold: Promise<void> | null): Response {
  if (hold === null)
    return new Response(encodeFrames(batches), { headers: SSE_HEADERS, status: 200 });
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(encodeFrames(batches.slice(0, 1))));
      await hold;
      controller.enqueue(encoder.encode(encodeFrames(batches.slice(1))));
      controller.close();
    },
  });
  return new Response(body, { headers: SSE_HEADERS, status: 200 });
}

/** Reply the fake runtime streams for `message`, so tests can assert on the transcript. */
export function fakeReply(message: string): string {
  return `Réponse à « ${message} »`;
}

/** Title the fake title agent produces for the first message of a chat. */
export function fakeTitle(message: string): string {
  return `Titre généré : ${message}`;
}

/**
 * Mirrors the API bridge: provisional title from the first message, native-looking events, the
 * stored transcript and the agent title pushed as `conversation` events.
 */
function runExecution(
  conversations: Conversation[],
  messages: Map<string, Message[]>,
  index: number,
  message: string,
  interrupted: boolean,
  attachments?: readonly MessageAttachment[],
): { initial: ExecutionSnapshot; final: ExecutionSnapshot; frames: SseFrames } {
  const current = conversations[index]!;
  const now = new Date().toISOString();
  const executionId = nextId();
  const untitled = current.titleSource === 'none';
  const provisional: Conversation = {
    ...current,
    lastActivityAt: now,
    title: untitled ? message.split('\n')[0]!.trim() : current.title,
    titleSource: untitled ? 'auto' : current.titleSource,
    updatedAt: now,
  };
  const titled: Conversation = untitled
    ? { ...provisional, title: fakeTitle(message) }
    : provisional;
  conversations[index] = titled;
  const reply = fakeReply(message);
  messages.set(current.id, [
    ...(messages.get(current.id) ?? []),
    {
      content: message,
      conversationId: current.id,
      createdAt: now,
      executionId,
      id: nextId(),
      role: 'user',
      ...(attachments === undefined ? {} : { attachments }),
    },
    {
      content: reply,
      conversationId: current.id,
      createdAt: now,
      executionId,
      id: nextId(),
      role: 'assistant',
    },
  ]);
  const execution = (status: 'running' | 'completed') => ({
    conversationId: current.id,
    createdAt: now,
    error: null,
    finishedAt: status === 'completed' ? now : null,
    id: executionId,
    startedAt: now,
    status,
  });
  const initial: ExecutionSnapshot = {
    execution: execution('running'),
    conversation: provisional,
    userMessage: message,
    assistantText: '',
    activities: [],
    cursor: 'cursor:0',
    revision: 0,
    ...(attachments === undefined ? {} : { attachments }),
  };
  const final: ExecutionSnapshot = {
    ...initial,
    execution: execution('completed'),
    conversation: titled,
    assistantText: reply,
    cursor: 'cursor:2',
    revision: 2,
  };
  const partial = { ...initial, assistantText: reply.slice(0, 8), revision: 1, cursor: 'cursor:1' };
  const full = { ...initial, assistantText: reply, revision: 2, cursor: 'cursor:2' };
  return {
    initial,
    final,
    frames: synthesizeRun([initial, partial, full, ...(interrupted ? [] : [final])]),
  };
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
    /** Capability manifest overrides; everything else stays disabled. */
    readonly features?: Partial<FeatureFlags>;
    /** Names the files a message carries, as the files API would; absent: rows carry none. */
    readonly attachmentsOf?: (fileIds: readonly string[]) => readonly MessageAttachment[];
  } = {},
) {
  const projects: Project[] = [...(seed.projects ?? [])];
  const conversations: Conversation[] = [...(seed.conversations ?? [])];
  const features: FeatureFlags = { ...DISABLED_FEATURE_FLAGS, ...seed.features };
  const messages = new Map<string, Message[]>();
  const calls: RecordedCall[] = [];
  const failures = new Map<string, Failure>();
  let executionHold: Promise<void> | null = null;
  let interruptExecutions = false;
  const executions = new Map<string, ReturnType<typeof runExecution>>();
  const documents = new Map<
    string,
    {
      kind: string;
      content: string;
      revision: number;
      contentHash: string;
      updatedAt: string | null;
    }
  >();

  const route = (method: string, url: URL, body: unknown): Response => {
    const path = url.pathname;
    const failure_ = failures.get(`${method} ${path}`);
    if (failure_ !== undefined) return failure(failure_.status, failure_.code);
    const contextMatch =
      /^\/api\/(context\/personal|projects\/[^/]+\/context-documents)(?:\/(instructions|context|preferences))?$/u.exec(
        path,
      );
    if (contextMatch !== null) {
      const scope = contextMatch[1]!;
      const kinds =
        scope === 'context/personal' ? ['instructions', 'preferences'] : ['context', 'preferences'];
      const getDocument = (kind: string) =>
        documents.get(`${scope}/${kind}`) ?? {
          kind,
          content: '',
          revision: 0,
          contentHash: '0'.repeat(64),
          updatedAt: null,
        };
      if (method === 'GET')
        return json({
          success: true,
          data: { maxBytes: 65536, documents: kinds.map(getDocument) },
        });
      const kind = contextMatch[2]!;
      const input = body as { content: string; expectedRevision: number };
      const current = getDocument(kind);
      if (input.expectedRevision !== current.revision)
        return failure(409, 'context_revision_conflict');
      const saved = {
        ...current,
        content: input.content,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      documents.set(`${scope}/${kind}`, saved);
      return json({ success: true, data: saved });
    }
    if (path === '/api/users/me/workspaces')
      return json({
        success: true,
        data: {
          tenant: { id: TENANT_ID, name: 'Organisation de test' },
          workspaces: [
            { id: WORKSPACE_ID, name: 'Équipe produit' },
            { id: SECOND_WORKSPACE_ID, name: 'Équipe recherche' },
          ],
        },
      });
    if (path === '/api/features') return json({ data: features, success: true });
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
    const moveMatch = /^\/api\/conversations\/([^/]+)\/move$/u.exec(path);
    if (moveMatch !== null && method === 'POST') {
      const index = conversations.findIndex((item) => item.id === moveMatch[1]);
      if (index === -1) return failure(404, 'conversation_not_found');
      const input = body as { projectId: string };
      const target = projects.find((item) => item.id === input.projectId);
      if (target === undefined) return failure(404, 'project_not_found');
      const current = conversations[index]!;
      conversations[index] = { ...current, projectId: target.id, projectKind: target.kind };
      const sourceIndex = projects.findIndex((item) => item.id === current.projectId);
      if (sourceIndex !== -1) projects.splice(sourceIndex, 1);
      return json({ data: conversations[index], success: true });
    }
    const chatPinMatch = /^\/api\/conversations\/([^/]+)\/(pin|unpin)$/u.exec(path);
    if (chatPinMatch !== null && method === 'POST') {
      const index = conversations.findIndex((item) => item.id === chatPinMatch[1]);
      if (index === -1) return failure(404, 'conversation_not_found');
      conversations[index] = {
        ...conversations[index]!,
        pinnedAt: chatPinMatch[2] === 'pin' ? new Date().toISOString() : null,
      };
      return json({ data: conversations[index], success: true });
    }
    const messagesMatch = /^\/api\/conversations\/([^/]+)\/messages$/u.exec(path);
    if (messagesMatch !== null && method === 'GET') {
      if (!conversations.some((item) => item.id === messagesMatch[1])) {
        return failure(404, 'conversation_not_found', 'Conversation not found.');
      }
      return json({ data: { items: messages.get(messagesMatch[1]!) ?? [] }, success: true });
    }
    const executionsMatch = /^\/api\/conversations\/([^/]+)\/executions$/u.exec(path);
    if (executionsMatch !== null && method === 'POST') {
      if (!features.agentRuntime) return failure(404, 'HTTP_404', 'Feature is not available');
      const index = conversations.findIndex((item) => item.id === executionsMatch[1]);
      if (index === -1) return failure(404, 'conversation_not_found', 'Conversation not found.');
      const { message, attachmentIds } = body as {
        message: string;
        attachmentIds?: readonly string[];
      };
      const run = runExecution(
        conversations,
        messages,
        index,
        message,
        interruptExecutions,
        attachmentIds === undefined ? undefined : seed.attachmentsOf?.(attachmentIds),
      );
      executions.set(run.initial.execution.id, run);
      return json({ success: true, data: { snapshot: run.initial } }, 202);
    }
    const activeMatch = /^\/api\/conversations\/([^/]+)\/executions\/active$/u.exec(path);
    if (activeMatch && method === 'GET') {
      const active =
        executionHold === null
          ? null
          : ([...executions.values()].find(
              (run) => run.initial.execution.conversationId === activeMatch[1],
            )?.initial ?? null);
      return json({ success: true, data: { snapshot: active } });
    }
    const executionMatch = /^\/api\/executions\/([^/]+)(?:\/(events|stop|trace-link))?$/u.exec(
      path,
    );
    if (executionMatch) {
      if (executionMatch[2] === 'trace-link' && !features.traceLinks) {
        return failure(404, 'HTTP_404', 'Feature is not available');
      }
      const run = executions.get(executionMatch[1]!);
      if (!run) return failure(404, 'execution_not_found');
      if (executionMatch[2] === 'trace-link') {
        return json({
          success: true,
          data: {
            url: `https://smith.langchain.com/o/org/projects/p/proj/r/${run.initial.execution.id}?poll=true`,
          },
        });
      }
      if (executionMatch[2] === 'events') return sseResponse(run.frames, executionHold);
      const snapshot = executionHold === null ? run.final : run.initial;
      return json({ success: true, data: { snapshot } });
    }
    const conversationMatch = /^\/api\/conversations\/([^/]+)$/u.exec(path);
    if (conversationMatch !== null) {
      const index = conversations.findIndex((item) => item.id === conversationMatch[1]);
      if (index === -1) return failure(404, 'conversation_not_found', 'Conversation not found.');
      if (method === 'GET') return json({ data: conversations[index], success: true });
      if (method === 'PATCH') {
        const input = body as { title: string };
        conversations[index] = {
          ...conversations[index]!,
          title: input.title,
          titleSource: 'user',
        };
        return json({ data: conversations[index], success: true });
      }
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
      const projectKind = url.searchParams.get('projectKind');
      if (projectId !== null && !projects.some((item) => item.id === projectId)) {
        return failure(404, 'project_not_found', 'Project not found.');
      }
      const failure_ = failures.get('GET /api/conversations');
      if (failure_ !== undefined) return failure(failure_.status, failure_.code);
      const all = byDate(
        conversations.filter(
          (item) =>
            (projectId === null || item.projectId === projectId) &&
            (projectKind === null || item.projectKind === projectKind),
        ),
        (item) => item.createdAt,
      );
      all.sort((left, right) => Number(right.pinnedAt !== null) - Number(left.pinnedAt !== null));
      // Offset cursors stand in for the opaque API cursors; the client treats both as strings.
      const offset = Number(url.searchParams.get('cursor') ?? '0');
      const limit = Number(url.searchParams.get('limit') ?? '50');
      const items = all.slice(offset, offset + limit);
      const nextCursor = offset + limit < all.length ? String(offset + limit) : null;
      return json({ data: { items, nextCursor }, success: true });
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
    /** Keep every answer in progress until the returned function is called. */
    holdExecutions(): () => void {
      let release = () => undefined as void;
      executionHold = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        executionHold = null;
        release();
      };
    },
    /** Close every answer stream before its terminal execution state. */
    interruptExecutions() {
      interruptExecutions = true;
    },
    projects,
    recover() {
      failures.clear();
    },
  };
}
