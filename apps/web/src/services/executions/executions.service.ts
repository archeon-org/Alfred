import {
  messageListEnvelopeSchema,
  type ExecutionStreamEvent,
  type Message,
} from '@alfred/contracts';

import { parseSseStream } from '@/services/executions/sse';
import { JSON_HEADERS, parseEnvelope, readJsonBody, throwApiError } from '@/services/http/api-json';
import type { HttpClient } from '@/services/http/http-client';

export type { Execution, ExecutionStreamEvent, Message } from '@alfred/contracts';

function conversationPath(id: string, suffix: string): `/${string}` {
  return `/conversations/${encodeURIComponent(id)}/${suffix}`;
}

/** Stored transcript of one owned conversation, oldest first. */
export async function listMessages(client: HttpClient, conversationId: string): Promise<Message[]> {
  const response = await client.request(conversationPath(conversationId, 'messages'), {
    headers: { Accept: JSON_HEADERS.Accept },
    method: 'GET',
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    messageListEnvelopeSchema,
    await readJsonBody(response),
    'La liste des messages est invalide.',
  ).items;
}

/**
 * Sends one message and yields the live stream: `execution` lifecycle events from the API plus
 * every native LangGraph event relayed unchanged. Abort `signal` to stop listening.
 */
export async function* streamExecution(
  client: HttpClient,
  conversationId: string,
  message: string,
  signal: AbortSignal,
): AsyncGenerator<ExecutionStreamEvent> {
  const response = await client.request(conversationPath(conversationId, 'executions'), {
    body: JSON.stringify({ message }),
    headers: { ...JSON_HEADERS, Accept: 'text/event-stream' },
    method: 'POST',
    // A 401 is raised by the guard before any execution exists, so a refreshed retry is safe.
    retryOnUnauthorized: true,
    signal,
  });
  if (!response.ok) await throwApiError(response);
  if (response.body === null) throw new Error('Le flux de la conversation est vide.');
  yield* parseSseStream(response.body);
}
