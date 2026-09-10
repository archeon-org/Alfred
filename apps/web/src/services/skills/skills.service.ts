import {
  skillEnvelopeSchema,
  skillListEnvelopeSchema,
  skillVersionListEnvelopeSchema,
  type SkillDetail,
  type SkillWriteInput,
} from '@alfred/contracts';
import {
  JSON_HEADERS,
  parseEnvelope,
  readJsonBody,
  throwApiError,
  withQuery,
} from '@/services/http/api-json';
import type { HttpClient } from '@/services/http/http-client';

const path = (id: string): `/${string}` => `/skills/${encodeURIComponent(id)}`;
export async function listSkills(client: HttpClient, cursor?: string, search?: string) {
  const response = await client.request(withQuery('/skills', { cursor, limit: 50, search }), {
    method: 'GET',
    headers: JSON_HEADERS,
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    skillListEnvelopeSchema,
    await readJsonBody(response),
    'La liste des skills est invalide.',
  );
}
export async function getSkill(client: HttpClient, id: string): Promise<SkillDetail> {
  const response = await client.request(path(id), { method: 'GET', headers: JSON_HEADERS });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    skillEnvelopeSchema,
    await readJsonBody(response),
    'Le skill reçu est invalide.',
  );
}
export async function saveSkill(
  client: HttpClient,
  input: SkillWriteInput,
  current?: { id: string; version: number },
): Promise<SkillDetail> {
  const response = await client.request(current ? path(current.id) : '/skills', {
    method: current ? 'PUT' : 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(current ? { ...input, expectedVersion: current.version } : input),
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    skillEnvelopeSchema,
    await readJsonBody(response),
    'Le skill enregistré est invalide.',
  );
}
export async function publishSkill(client: HttpClient, id: string, expectedVersion: number) {
  const response = await client.request(`${path(id)}/publish`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ expectedVersion }),
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    skillEnvelopeSchema,
    await readJsonBody(response),
    'Le skill publié est invalide.',
  );
}
export async function deleteSkill(client: HttpClient, id: string, expectedVersion: number) {
  const response = await client.request(path(id), {
    method: 'DELETE',
    headers: JSON_HEADERS,
    body: JSON.stringify({ expectedVersion }),
  });
  if (!response.ok) await throwApiError(response);
}
export async function listSkillVersions(client: HttpClient, id: string, before?: number) {
  const response = await client.request(withQuery(`${path(id)}/versions`, { before, limit: 20 }), {
    method: 'GET',
    headers: JSON_HEADERS,
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    skillVersionListEnvelopeSchema,
    await readJsonBody(response),
    'L’historique reçu est invalide.',
  );
}
export async function restoreSkill(
  client: HttpClient,
  id: string,
  expectedVersion: number,
  sourceVersion: number,
) {
  const response = await client.request(`${path(id)}/restore`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ expectedVersion, sourceVersion }),
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    skillEnvelopeSchema,
    await readJsonBody(response),
    'Le skill restauré est invalide.',
  );
}
export async function setSkillAvailability(
  client: HttpClient,
  id: string,
  expectedVersion: number,
  enabled: boolean,
) {
  const response = await client.request(`${path(id)}/availability`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ expectedVersion, enabled }),
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    skillEnvelopeSchema,
    await readJsonBody(response),
    'Le statut reçu est invalide.',
  );
}
