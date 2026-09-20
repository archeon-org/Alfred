import type { ExecutionSnapshot, Message } from '@alfred/contracts';
import type { Page, Route } from '@playwright/test';

import { encodeAgUiFrames, synthesizeRun } from '../../support/ag-ui-synth';
import { executionSnapshot, installExecutionApi, sse } from './executions-api';
import { CONVERSATION_ID, defaultSeed } from './workspace-api';

export const SECOND_CONVERSATION_ID = '7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d';
const SECOND_EXECUTION_ID = '55555555-5555-4555-8555-555555555555';
const TERMINAL = new Set(['completed', 'cancelled', 'failed', 'timed_out']);

/** Distinct durable executions with separately controlled event responses and transcripts. */
export async function installConcurrentExecutionApi(page: Page) {
  const seed = defaultSeed();
  const conversations = [
    { ...seed.conversations[0]!, title: 'Chat A' },
    { ...seed.conversations[0]!, id: SECOND_CONVERSATION_ID, title: 'Chat B' },
  ];
  await installExecutionApi(page, { ...seed, conversations });
  const snapshots = new Map<string, ExecutionSnapshot>();
  const observers = new Map<string, Route[]>();
  const observed = new Set<string>();
  const submissions: { conversationId: string; submissionId: string; message: string }[] = [];
  const stops: string[] = [];
  const connections: { conversationId: string; cursor: string | null }[] = [];
  let listRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/conversations')
      listRequests += 1;
  });
  const json = (route: Route, snapshot: ExecutionSnapshot | null) =>
    route.fulfill({ json: { success: true, data: { snapshot } } });
  await page.route('**/api/conversations/*/executions', (route) => {
    const conversationId = new URL(route.request().url()).pathname.split('/')[3]!;
    const body = route.request().postDataJSON() as { submissionId: string; message: string };
    submissions.push({ conversationId, ...body });
    const initial = executionSnapshot();
    const snapshot: ExecutionSnapshot = {
      ...initial,
      conversation: conversations.find((conversation) => conversation.id === conversationId)!,
      execution: {
        ...initial.execution,
        conversationId,
        id: conversationId === CONVERSATION_ID ? initial.execution.id : SECOND_EXECUTION_ID,
      },
      userMessage: body.message,
    };
    snapshots.set(conversationId, snapshot);
    return json(route, snapshot);
  });
  await page.route('**/api/conversations/*/executions/active', (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[3]!;
    const snapshot = snapshots.get(id);
    return json(route, snapshot && !TERMINAL.has(snapshot.execution.status) ? snapshot : null);
  });
  await page.route('**/api/conversations/*/messages', (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[3]!;
    const snapshot = snapshots.get(id);
    const items: Message[] =
      snapshot && TERMINAL.has(snapshot.execution.status)
        ? (['user', 'assistant'] as const).map((role, index) => ({
            id: `44444444-4444-4444-8444-44444444444${index}`,
            conversationId: id,
            executionId: snapshot.execution.id,
            createdAt: snapshot.execution.createdAt,
            role,
            content: role === 'user' ? snapshot.userMessage : snapshot.assistantText,
          }))
        : [];
    return route.fulfill({ json: { success: true, data: { items } } });
  });
  await page.route('**/api/executions/**', async (route) => {
    const [, , , executionId, command] = new URL(route.request().url()).pathname.split('/');
    const snapshot = [...snapshots.values()].find((item) => item.execution.id === executionId)!;
    const id = snapshot.execution.conversationId;
    if (command === 'stop') {
      stops.push(id);
      const stopping = {
        ...snapshot,
        execution: { ...snapshot.execution, status: 'stopping' as const },
      };
      snapshots.set(id, stopping);
      return json(route, stopping);
    }
    if (command !== 'events') return json(route, snapshot);
    connections.push({
      conversationId: id,
      cursor: route.request().headers()['last-event-id'] ?? null,
    });
    if (observed.has(id)) {
      observers.set(id, [...(observers.get(id) ?? []), route]);
      return;
    }
    observed.add(id);
    // A realistic projection burst changes activity timestamps on every event. It must not
    // refetch all sidebar lists forty times or unmount the active chat while React processes it.
    const progress = Array.from({ length: 40 }, (_, index) => {
      const updatedAt = new Date(
        Date.parse(snapshot.conversation.updatedAt) + (index + 1) * 500,
      ).toISOString();
      const next = {
        ...snapshot,
        revision: index + 1,
        cursor: `${id}:${index + 1}`,
        // Cumulative text, as the projection is: the final frame appends the burst size.
        assistantText:
          index === 39
            ? `Progress ${snapshot.conversation.title} 40`
            : `Progress ${snapshot.conversation.title}`,
        conversation: { ...snapshot.conversation, updatedAt, lastActivityAt: updatedAt },
      };
      snapshots.set(id, next);
      return next;
    });
    return route.fulfill({
      contentType: 'text/event-stream',
      body: encodeAgUiFrames(synthesizeRun(progress).flat()),
    });
  });
  return {
    submissions,
    stops,
    connections,
    get listRequests() {
      return listRequests;
    },
    pendingObservers: (id: string) => observers.get(id)?.length ?? 0,
    async finish(id: string, text: string, status: 'completed' | 'cancelled') {
      const current = snapshots.get(id)!;
      const snapshot = {
        ...current,
        revision: current.revision + 1,
        cursor: `${id}:${current.revision + 1}`,
        assistantText: text,
        execution: { ...current.execution, status },
      };
      snapshots.set(id, snapshot);
      const pending = observers.get(id) ?? [];
      observers.set(id, []);
      await Promise.all(
        pending.map((route) =>
          route.fulfill({ contentType: 'text/event-stream', body: sse(snapshot) }),
        ),
      );
    },
  };
}
