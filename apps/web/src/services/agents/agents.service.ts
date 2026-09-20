import { agentListEnvelopeSchema, type AgentPage } from '@alfred/contracts';
import {
  JSON_HEADERS,
  parseEnvelope,
  readJsonBody,
  throwApiError,
  withQuery,
} from '@/services/http/api-json';
import type { HttpClient } from '@/services/http/http-client';

export const AGENT_PAGE_SIZE = 10;

/** One page of the runtime's declared sub-agents, relayed by the API (the browser never reaches the runtime). */
export async function listAgents(
  client: HttpClient,
  cursor?: string,
  search?: string,
): Promise<AgentPage> {
  const response = await client.request(
    withQuery('/agents', { cursor, limit: AGENT_PAGE_SIZE, search: search || undefined }),
    { method: 'GET', headers: JSON_HEADERS },
  );
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    agentListEnvelopeSchema,
    await readJsonBody(response),
    'Le catalogue d’agents est invalide.',
  );
}
