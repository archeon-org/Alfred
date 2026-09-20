import {
  fileEnvelopeSchema,
  fileFolderEnvelopeSchema,
  fileFolderListEnvelopeSchema,
  fileListEnvelopeSchema,
  fileQuotaEnvelopeSchema,
  fileUploadEnvelopeSchema,
  type CreateFolderInput,
  type FileFolder,
  type FileListFilters,
  type FilePage,
  type FileQuota,
  type FileUploadResult,
  type StoredFile,
  type UpdateFileInput,
  type UpdateFolderInput,
} from '@alfred/contracts';

import {
  JSON_HEADERS,
  parseEnvelope,
  readJsonBody,
  throwApiError,
  withQuery,
} from '@/services/http/api-json';
import type { HttpClient, HttpRequestInit } from '@/services/http/http-client';

export type { FileListFilters, FilePage, FileQuota, FileUploadResult, StoredFile };

export const FILE_PAGE_SIZE = 20;

export interface FileUploadRequest {
  readonly file: File;
  /** Generated once per file and sent again on every retry, so a retry never charges quota twice. */
  readonly uploadId: string;
  /** Absent or null: the top level of the library. */
  readonly folderId?: string | null;
}

const filePath = (id: string, suffix = ''): `/${string}` =>
  `/files/${encodeURIComponent(id)}${suffix}`;
const folderPath = (id: string): `/${string}` => `/files/folders/${encodeURIComponent(id)}`;
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

const ACCEPT_JSON = Object.freeze({ Accept: JSON_HEADERS.Accept });

/** A JSON answer; a request with a body declares it, and a rejected token may replay it once. */
async function requestJson(client: HttpClient, path: `/${string}`, init: HttpRequestInit) {
  const response = await client.request(path, {
    ...init,
    headers: init.body === undefined ? ACCEPT_JSON : JSON_HEADERS,
    retryOnUnauthorized: true,
  });
  if (!response.ok) await throwApiError(response);
  return readJsonBody(response);
}

async function requestNothing(client: HttpClient, path: `/${string}`, init: HttpRequestInit) {
  const response = await client.request(path, {
    ...init,
    headers: ACCEPT_JSON,
    retryOnUnauthorized: true,
  });
  if (!response.ok) await throwApiError(response);
}

/** Bytes always travel through the client: the bearer token never reaches an `href` or a `src`. */
async function requestBlob(client: HttpClient, path: `/${string}`, signal?: AbortSignal) {
  const response = await client.request(path, { method: 'GET', ...withSignal(signal) });
  if (!response.ok) await throwApiError(response);
  return response.blob();
}

/** One page of the library, newest first. Empty filters are left out of the query string. */
export async function listFiles(
  client: HttpClient,
  filters: FileListFilters = {},
  cursor?: string,
  signal?: AbortSignal,
): Promise<FilePage> {
  const { search, kind, readiness, folderId, conversationId, tag } = filters;
  return parseEnvelope(
    fileListEnvelopeSchema,
    await requestJson(
      client,
      withQuery('/files', {
        search: search || undefined,
        kind,
        readiness,
        folderId,
        conversationId,
        tag: tag || undefined,
        cursor,
        limit: FILE_PAGE_SIZE,
      }),
      { method: 'GET', ...withSignal(signal) },
    ),
    'La liste des fichiers est invalide.',
  );
}

export async function getFile(
  client: HttpClient,
  id: string,
  signal?: AbortSignal,
): Promise<StoredFile> {
  return parseEnvelope(
    fileEnvelopeSchema,
    await requestJson(client, filePath(id), { method: 'GET', ...withSignal(signal) }),
    'Le fichier reçu est invalide.',
  );
}

/**
 * One file per request. The body is a `FormData`, sent without a content type so the browser
 * writes the multipart boundary itself. A replay after a token refresh is safe: the `uploadId`
 * makes the request idempotent.
 */
export async function uploadFile(
  client: HttpClient,
  { file, uploadId, folderId }: FileUploadRequest,
  signal?: AbortSignal,
): Promise<FileUploadResult> {
  const body = new FormData();
  body.set('file', file, file.name);
  body.set('uploadId', uploadId);
  if (folderId != null) body.set('folderId', folderId);
  const response = await client.request('/files', {
    body,
    headers: ACCEPT_JSON,
    method: 'POST',
    retryOnUnauthorized: true,
    ...withSignal(signal),
  });
  if (!response.ok) await throwApiError(response);
  return parseEnvelope(
    fileUploadEnvelopeSchema,
    await readJsonBody(response),
    'La réponse de l’envoi est invalide.',
  );
}

export async function updateFile(
  client: HttpClient,
  id: string,
  input: UpdateFileInput,
): Promise<StoredFile> {
  return parseEnvelope(
    fileEnvelopeSchema,
    await requestJson(client, filePath(id), { body: JSON.stringify(input), method: 'PATCH' }),
    'Le fichier enregistré est invalide.',
  );
}

export function deleteFile(client: HttpClient, id: string): Promise<void> {
  return requestNothing(client, filePath(id), { method: 'DELETE' });
}

/** The original bytes. The catalog row names the download, not `Content-Disposition`. */
export function getFileContent(
  client: HttpClient,
  id: string,
  signal?: AbortSignal,
): Promise<Blob> {
  return requestBlob(client, filePath(id, '/content'), signal);
}

/** The reduced JPEG copy of a ready image; any other file answers 404. */
export function getFilePreview(
  client: HttpClient,
  id: string,
  signal?: AbortSignal,
): Promise<Blob> {
  return requestBlob(client, filePath(id, '/preview'), signal);
}

export async function getFileQuota(client: HttpClient, signal?: AbortSignal): Promise<FileQuota> {
  return parseEnvelope(
    fileQuotaEnvelopeSchema,
    await requestJson(client, '/files/quota', { method: 'GET', ...withSignal(signal) }),
    'Le quota reçu est invalide.',
  );
}

/** The whole folder tree, flat: a library holds few enough folders for one answer. */
export async function listFolders(
  client: HttpClient,
  signal?: AbortSignal,
): Promise<readonly FileFolder[]> {
  const { items } = parseEnvelope(
    fileFolderListEnvelopeSchema,
    await requestJson(client, '/files/folders', { method: 'GET', ...withSignal(signal) }),
    'La liste des dossiers est invalide.',
  );
  return items;
}

export async function createFolder(
  client: HttpClient,
  input: CreateFolderInput,
): Promise<FileFolder> {
  return parseEnvelope(
    fileFolderEnvelopeSchema,
    await requestJson(client, '/files/folders', { body: JSON.stringify(input), method: 'POST' }),
    'Le dossier créé est invalide.',
  );
}

export async function updateFolder(
  client: HttpClient,
  id: string,
  input: UpdateFolderInput,
): Promise<FileFolder> {
  return parseEnvelope(
    fileFolderEnvelopeSchema,
    await requestJson(client, folderPath(id), { body: JSON.stringify(input), method: 'PATCH' }),
    'Le dossier enregistré est invalide.',
  );
}

export function deleteFolder(client: HttpClient, id: string): Promise<void> {
  return requestNothing(client, folderPath(id), { method: 'DELETE' });
}
