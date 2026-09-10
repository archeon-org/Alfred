import {
  contextDocumentEnvelopeSchema,
  contextDocumentSetEnvelopeSchema,
  type ContextDocument,
  type ContextDocumentSet,
  type SaveContextDocumentInput,
} from '@alfred/contracts';
import { JSON_HEADERS, parseEnvelope, readJsonBody, throwApiError } from '@/services/http/api-json';
import type { HttpClient } from '@/services/http/http-client';

export type ContextScope =
  { readonly type: 'personal' } | { readonly type: 'project'; readonly projectId: string };

export function contextPath(scope: ContextScope): `/${string}` {
  return scope.type === 'personal'
    ? '/context/personal'
    : `/projects/${encodeURIComponent(scope.projectId)}/context-documents`;
}

export async function getContextDocuments(
  client: HttpClient,
  scope: ContextScope,
): Promise<ContextDocumentSet> {
  const response = await client.request(contextPath(scope), {
    method: 'GET',
    headers: JSON_HEADERS,
  });
  if (!response.ok) await throwApiError(response);
  const result = parseEnvelope(
    contextDocumentSetEnvelopeSchema,
    await readJsonBody(response),
    'Les contenus reçus sont invalides.',
  );
  const expected =
    scope.type === 'personal' ? ['instructions', 'preferences'] : ['context', 'preferences'];
  if (
    result.documents.length !== 2 ||
    expected.some((kind) => result.documents.filter((doc) => doc.kind === kind).length !== 1)
  )
    throw new Error('Les contenus reçus ne correspondent pas à cet espace.');
  return result;
}

export async function saveContextDocument(
  client: HttpClient,
  scope: ContextScope,
  kind: ContextDocument['kind'],
  input: SaveContextDocumentInput,
): Promise<ContextDocument> {
  const response = await client.request(`${contextPath(scope)}/${kind}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
    retryOnUnauthorized: true,
  });
  if (!response.ok) await throwApiError(response);
  const result = parseEnvelope(
    contextDocumentEnvelopeSchema,
    await readJsonBody(response),
    'Le contenu reçu est invalide.',
  );
  if (result.kind !== kind) throw new Error('Le contenu reçu ne correspond pas au document.');
  return result;
}
