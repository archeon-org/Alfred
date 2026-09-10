import { currentWorkspacesEnvelopeSchema, type CurrentWorkspaces } from '@alfred/contracts';
import { JSON_HEADERS, parseEnvelope, readJsonBody, throwApiError } from '@/services/http/api-json';
import type { HttpClient } from '@/services/http/http-client';

export async function getCurrentWorkspaces(client: HttpClient): Promise<CurrentWorkspaces> {
  const response = await client.request('/users/me/workspaces', {
    method: 'GET',
    headers: { Accept: JSON_HEADERS.Accept },
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    currentWorkspacesEnvelopeSchema,
    await readJsonBody(response),
    'L’organisation ou les équipes reçues sont invalides.',
  );
}
