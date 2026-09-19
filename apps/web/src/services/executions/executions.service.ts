import {
  activeExecutionEnvelopeSchema,
  EXECUTION_STREAM_ERROR_EVENT,
  EXECUTION_STREAM_UNAVAILABLE_CODE,
  executionSnapshotEnvelopeSchema,
  executionTraceLinkEnvelopeSchema,
  messageListEnvelopeSchema,
  type ExecutionSnapshot,
  type Message,
} from '@alfred/contracts';

import { EventType } from '@ag-ui/core';

import { canonicalAgUiEvent, type AlfredAgUiEvent } from '@/lib/workspace/ag-ui-events';
import { InvalidStreamError, parseSseStream } from '@/services/executions/sse';
import {
  ApiRequestError,
  JSON_HEADERS,
  parseEnvelope,
  readJsonBody,
  throwApiError,
} from '@/services/http/api-json';
import type { HttpClient, HttpRequestInit } from '@/services/http/http-client';

export type {
  Execution,
  ExecutionStreamEvent,
  ExecutionTraceLink,
  Message,
} from '@alfred/contracts';
export type { AlfredAgUiEvent } from '@/lib/workspace/ag-ui-events';

/** One validated AG-UI event of the observed execution with the opaque cursor of its frame. */
export interface ObservedAgUiFrame {
  readonly event: AlfredAgUiEvent;
  readonly id?: string;
}

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

/**
 * Observation never submits or cancels work. Authorization refresh is handled by HttpClient. Only
 * well-formed AG-UI events of this execution pass; any other frame ends the observation as invalid.
 * When the conversation is known, run identity and state are bound to it as well, and the terminal
 * event must name the same thread as the run it closes.
 */
export async function* observeExecution(
  client: HttpClient,
  executionId: string,
  signal: AbortSignal,
  cursor?: string | null,
  conversationId?: string,
): AsyncGenerator<ObservedAgUiFrame> {
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
    let threadId: string | null = null;
    for await (const frame of parseSseStream(response.body, { onChunk: touch })) {
      if (frame.event === EXECUTION_STREAM_ERROR_EVENT && isTransientError(frame.data)) {
        throw new ApiRequestError(
          503,
          EXECUTION_STREAM_UNAVAILABLE_CODE,
          'Le flux est temporairement indisponible.',
        );
      }
      // AG-UI frames are unnamed `data:` frames; every named frame is foreign to this contract.
      if (frame.event !== 'message') throw new InvalidStreamError();
      const event = canonicalAgUiEvent(frame.data, {
        executionId,
        ...(conversationId === undefined ? {} : { conversationId }),
      });
      if (event === null) throw new InvalidStreamError();
      if (event.type === EventType.RUN_STARTED) threadId = event.threadId;
      else if (event.type === EventType.RUN_FINISHED && event.threadId !== threadId)
        throw new InvalidStreamError();
      yield { event, ...(frame.id === undefined ? {} : { id: frame.id }) };
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
    data.code === EXECUTION_STREAM_UNAVAILABLE_CODE
  );
}

/** Development diagnostic: the console address of an execution's trace, while `traceLinks` is on. */
export async function getExecutionTraceLink(
  client: HttpClient,
  executionId: string,
  signal?: AbortSignal,
) {
  return parseEnvelope(
    executionTraceLinkEnvelopeSchema,
    await jsonRequest(client, `/executions/${encodeURIComponent(executionId)}/trace-link`, {
      method: 'GET',
      ...(signal ? { signal } : {}),
    }),
    'Le lien de trace est invalide.',
  );
}
