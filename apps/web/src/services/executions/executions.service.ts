import {
  activeExecutionEnvelopeSchema,
  conversationSchema,
  executionDeltaSchema,
  executionSnapshotEnvelopeSchema,
  executionSnapshotSchema,
  messageListEnvelopeSchema,
  type Conversation,
  type ExecutionDelta,
  type ExecutionSnapshot,
  type Message,
} from '@alfred/contracts';

import { InvalidStreamError, parseSseStream } from '@/services/executions/sse';
import {
  ApiRequestError,
  JSON_HEADERS,
  parseEnvelope,
  readJsonBody,
  throwApiError,
} from '@/services/http/api-json';
import type { HttpClient, HttpRequestInit } from '@/services/http/http-client';

export type { Execution, ExecutionStreamEvent, Message } from '@alfred/contracts';

export type PublicExecutionEvent =
  | { readonly event: 'snapshot'; readonly data: ExecutionSnapshot; readonly id?: string }
  | { readonly event: 'delta'; readonly data: ExecutionDelta; readonly id?: string }
  | { readonly event: 'conversation'; readonly data: Conversation; readonly id?: string };

const REQUEST_TIMEOUT_MS = 20_000;
const OBSERVER_SILENCE_MS = 60_000;

function conversationPath(id: string, suffix: string): `/${string}` {
  return `/conversations/${encodeURIComponent(id)}/${suffix}`;
}

async function jsonRequest(client: HttpClient, path: `/${string}`, init: HttpRequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await client.request(path, {
      ...init,
      headers: { ...JSON_HEADERS, ...init.headers },
      signal:
        init.signal == null ? controller.signal : AbortSignal.any([init.signal, controller.signal]),
    });
    if (!response.ok) await throwApiError(response);
    return await readJsonBody(response);
  } finally {
    clearTimeout(timeout);
  }
}

/** Stored transcript of one owned conversation, oldest first. */
export async function listMessages(
  client: HttpClient,
  conversationId: string,
  signal?: AbortSignal,
): Promise<Message[]> {
  const { items } = parseEnvelope(
    messageListEnvelopeSchema,
    await jsonRequest(client, conversationPath(conversationId, 'messages'), {
      method: 'GET',
      ...(signal ? { signal } : {}),
    }),
    'La liste des messages est invalide.',
  );
  if (items.some((message) => message.conversationId !== conversationId))
    throw new InvalidStreamError();
  return items;
}

/** The submission id stays unchanged on every retry, including an ambiguous lost response. */
export async function createExecution(
  client: HttpClient,
  conversationId: string,
  message: string,
  submissionId: string,
  signal: AbortSignal,
): Promise<ExecutionSnapshot> {
  const { snapshot } = parseEnvelope(
    executionSnapshotEnvelopeSchema,
    await jsonRequest(client, conversationPath(conversationId, 'executions'), {
      body: JSON.stringify({ message, submissionId }),
      headers: { Accept: 'application/vnd.alfred.execution+json;version=1' },
      method: 'POST',
      retryOnUnauthorized: true,
      signal,
    }),
    'La réponse de l’exécution est invalide.',
  );
  assertSnapshot(snapshot, undefined, conversationId);
  return snapshot;
}

export async function getActiveExecution(
  client: HttpClient,
  conversationId: string,
  signal?: AbortSignal,
) {
  const { snapshot } = parseEnvelope(
    activeExecutionEnvelopeSchema,
    await jsonRequest(client, conversationPath(conversationId, 'executions/active'), {
      method: 'GET',
      ...(signal ? { signal } : {}),
    }),
    'La réponse de l’exécution est invalide.',
  );
  if (snapshot !== null) assertSnapshot(snapshot, undefined, conversationId);
  return snapshot;
}

export async function getExecution(client: HttpClient, executionId: string, signal?: AbortSignal) {
  const { snapshot } = parseEnvelope(
    executionSnapshotEnvelopeSchema,
    await jsonRequest(client, `/executions/${encodeURIComponent(executionId)}`, {
      method: 'GET',
      ...(signal ? { signal } : {}),
    }),
    'La réponse de l’exécution est invalide.',
  );
  assertSnapshot(snapshot, executionId);
  return snapshot;
}

/** A successful Stop response acknowledges durable intent; only a terminal snapshot settles it. */
export async function stopExecution(client: HttpClient, executionId: string, signal: AbortSignal) {
  const { snapshot } = parseEnvelope(
    executionSnapshotEnvelopeSchema,
    await jsonRequest(client, `/executions/${encodeURIComponent(executionId)}/stop`, {
      method: 'POST',
      retryOnUnauthorized: true,
      signal,
    }),
    'La réponse de l’exécution est invalide.',
  );
  assertSnapshot(snapshot, executionId);
  return snapshot;
}

/** Observation never submits or cancels work. Authorization refresh is handled by HttpClient. */
export async function* observeExecution(
  client: HttpClient,
  executionId: string,
  signal: AbortSignal,
  cursor?: string | null,
): AsyncGenerator<PublicExecutionEvent> {
  const observer = new AbortController();
  let timeout = setTimeout(() => observer.abort(), REQUEST_TIMEOUT_MS);
  const touch = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => observer.abort(), OBSERVER_SILENCE_MS);
  };
  try {
    const response = await client.request(`/executions/${encodeURIComponent(executionId)}/events`, {
      headers: { Accept: 'text/event-stream', ...(cursor ? { 'Last-Event-ID': cursor } : {}) },
      method: 'GET',
      signal: AbortSignal.any([signal, observer.signal]),
    });
    if (!response.ok) await throwApiError(response);
    if (
      !(
        response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ===
        'text/event-stream'
      ) ||
      response.body === null
    ) {
      throw new InvalidStreamError();
    }
    touch();
    for await (const event of parseSseStream(response.body, { onChunk: touch })) {
      const id = event.id === undefined ? {} : { id: event.id };
      if (event.event === 'error' && isTransientError(event.data)) {
        throw new ApiRequestError(
          503,
          'execution_stream_unavailable',
          'Le flux est temporairement indisponible.',
        );
      }
      if (event.event === 'snapshot') {
        const parsed = executionSnapshotSchema.safeParse(event.data);
        if (!parsed.success) throw new InvalidStreamError();
        assertSnapshot(parsed.data, executionId);
        if (event.id !== undefined && event.id !== parsed.data.cursor)
          throw new InvalidStreamError();
        yield { event: 'snapshot', data: parsed.data, ...id };
      } else if (event.event === 'delta') {
        const parsed = executionDeltaSchema.safeParse(event.data);
        if (!parsed.success || parsed.data.executionId !== executionId)
          throw new InvalidStreamError();
        if (event.id !== undefined && event.id !== parsed.data.cursor)
          throw new InvalidStreamError();
        yield { event: 'delta', data: parsed.data, ...id };
      } else if (event.event === 'conversation') {
        const parsed = conversationSchema.safeParse(event.data);
        if (!parsed.success) throw new InvalidStreamError();
        yield { event: 'conversation', data: parsed.data, ...id };
      } else throw new InvalidStreamError();
    }
  } finally {
    clearTimeout(timeout);
    observer.abort();
  }
}

function assertSnapshot(
  snapshot: ExecutionSnapshot,
  executionId?: string,
  conversationId?: string,
) {
  if (
    (executionId !== undefined && snapshot.execution.id !== executionId) ||
    (conversationId !== undefined && snapshot.execution.conversationId !== conversationId) ||
    snapshot.execution.conversationId !== snapshot.conversation.id
  )
    throw new InvalidStreamError();
}

function isTransientError(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    !Array.isArray(data) &&
    Object.keys(data).length === 1 &&
    'code' in data &&
    data.code === 'execution_stream_unavailable'
  );
}
