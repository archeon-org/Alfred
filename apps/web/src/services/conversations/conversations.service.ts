import {
  conversationEnvelopeSchema,
  conversationListEnvelopeSchema,
  type Conversation,
  type CreateConversationInput,
  updateConversationInputSchema,
  type UpdateConversationInput,
} from '@alfred/contracts';
import {
  JSON_HEADERS,
  parseEnvelope,
  readJsonBody,
  throwApiError,
  withQuery,
} from '@/services/http/api-json';
import type { HttpClient } from '@/services/http/http-client';

export type {
  Conversation,
  CreateConversationInput,
  UpdateConversationInput,
} from '@alfred/contracts';

export interface ConversationPage {
  readonly items: readonly Conversation[];
  readonly nextCursor: string | null;
}

export interface ConversationListQuery {
  /** Chats of one owned project; omitted, every recent chat of the caller. */
  readonly projectId?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

const INVALID_CONVERSATION = 'La conversation reçue est invalide.';

function conversationPath(id: string): `/${string}` {
  return `/conversations/${encodeURIComponent(id)}`;
}

export async function listConversations(
  client: HttpClient,
  query: ConversationListQuery = {},
): Promise<ConversationPage> {
  const response = await client.request(withQuery('/conversations', query), {
    headers: { Accept: JSON_HEADERS.Accept },
    method: 'GET',
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    conversationListEnvelopeSchema,
    await readJsonBody(response),
    'La liste des conversations est invalide.',
  );
}

export async function getConversation(client: HttpClient, id: string): Promise<Conversation> {
  const response = await client.request(conversationPath(id), {
    headers: { Accept: JSON_HEADERS.Accept },
    method: 'GET',
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    conversationEnvelopeSchema,
    await readJsonBody(response),
    INVALID_CONVERSATION,
  );
}

/** Without `projectId` the API creates a private implicit project for the chat. */
export async function createConversation(
  client: HttpClient,
  input: CreateConversationInput,
  idempotencyKey: string,
): Promise<Conversation> {
  const response = await client.request('/conversations', {
    body: JSON.stringify(input),
    headers: { ...JSON_HEADERS, 'Idempotency-Key': idempotencyKey },
    method: 'POST',
    retryOnUnauthorized: true,
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    conversationEnvelopeSchema,
    await readJsonBody(response),
    INVALID_CONVERSATION,
  );
}

export async function deleteConversation(client: HttpClient, id: string): Promise<void> {
  const response = await client.request(conversationPath(id), {
    headers: { Accept: JSON_HEADERS.Accept },
    method: 'DELETE',
    retryOnUnauthorized: true,
  });
  if (!response.ok) await throwApiError(response);
}

export async function updateConversation(
  client: HttpClient,
  id: string,
  input: UpdateConversationInput,
): Promise<Conversation> {
  return mutateConversation(
    client,
    conversationPath(id),
    'PATCH',
    updateConversationInputSchema.parse(input),
  );
}

export async function setConversationPinned(
  client: HttpClient,
  id: string,
  pinned: boolean,
): Promise<Conversation> {
  return mutateConversation(client, `${conversationPath(id)}/${pinned ? 'pin' : 'unpin'}`, 'POST');
}

async function mutateConversation(
  client: HttpClient,
  path: `/${string}`,
  method: 'PATCH' | 'POST',
  input?: UpdateConversationInput,
): Promise<Conversation> {
  const response = await client.request(path, {
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    headers: JSON_HEADERS,
    method,
    retryOnUnauthorized: true,
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    conversationEnvelopeSchema,
    await readJsonBody(response),
    INVALID_CONVERSATION,
  );
}
