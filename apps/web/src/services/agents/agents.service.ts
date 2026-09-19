import { agentCatalogEnvelopeSchema, type AgentCatalog } from '@alfred/contracts';
import { JSON_HEADERS, parseEnvelope, readJsonBody, throwApiError } from '@/services/http/api-json';
import type { HttpClient } from '@/services/http/http-client';

/** The runtime's declared sub-agents, relayed by the API (the browser never reaches the runtime). */
export async function listAgents(client: HttpClient): Promise<AgentCatalog> {
  const response = await client.request('/agents', { method: 'GET', headers: JSON_HEADERS });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    agentCatalogEnvelopeSchema,
    await readJsonBody(response),
    'Le catalogue d’agents est invalide.',
  );
}
