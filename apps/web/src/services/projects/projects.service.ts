import {
  projectEnvelopeSchema,
  projectListEnvelopeSchema,
  type CreateProjectInput,
  type Project,
  type UpdateProjectInput,
} from '@alfred/contracts';
import {
  JSON_HEADERS,
  parseEnvelope,
  readJsonBody,
  throwApiError,
  withQuery,
} from '@/services/http/api-json';
import type { HttpClient } from '@/services/http/http-client';

export type { CreateProjectInput, Project, UpdateProjectInput } from '@alfred/contracts';

export interface ProjectPage {
  readonly items: readonly Project[];
  readonly nextCursor: string | null;
}

export interface PageQuery {
  readonly cursor?: string;
  readonly limit?: number;
}

const INVALID_PROJECT = 'Le projet reçu est invalide.';

function projectPath(id: string): `/${string}` {
  return `/projects/${encodeURIComponent(id)}`;
}

export async function listProjects(
  client: HttpClient,
  query: PageQuery = {},
): Promise<ProjectPage> {
  const response = await client.request(withQuery('/projects', query), {
    headers: { Accept: JSON_HEADERS.Accept },
    method: 'GET',
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    projectListEnvelopeSchema,
    await readJsonBody(response),
    'La liste des projets est invalide.',
  );
}

export async function getProject(client: HttpClient, id: string): Promise<Project> {
  const response = await client.request(projectPath(id), {
    headers: { Accept: JSON_HEADERS.Accept },
    method: 'GET',
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(projectEnvelopeSchema, await readJsonBody(response), INVALID_PROJECT);
}

/** Retrying after a refresh is safe because the same idempotency key is replayed. */
export async function createProject(
  client: HttpClient,
  input: CreateProjectInput,
  idempotencyKey: string,
): Promise<Project> {
  const response = await client.request('/projects', {
    body: JSON.stringify(input),
    headers: { ...JSON_HEADERS, 'Idempotency-Key': idempotencyKey },
    method: 'POST',
    retryOnUnauthorized: true,
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(projectEnvelopeSchema, await readJsonBody(response), INVALID_PROJECT);
}

export async function updateProject(
  client: HttpClient,
  id: string,
  input: UpdateProjectInput,
): Promise<Project> {
  const response = await client.request(projectPath(id), {
    body: JSON.stringify(input),
    headers: JSON_HEADERS,
    method: 'PATCH',
    retryOnUnauthorized: true,
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(projectEnvelopeSchema, await readJsonBody(response), INVALID_PROJECT);
}

export async function deleteProject(client: HttpClient, id: string): Promise<void> {
  const response = await client.request(projectPath(id), {
    headers: { Accept: JSON_HEADERS.Accept },
    method: 'DELETE',
    retryOnUnauthorized: true,
  });
  if (!response.ok) await throwApiError(response);
}
