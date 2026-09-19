import type {
  FeatureFlags,
  FileFolder,
  FileQuota,
  MessageAttachment,
  StoredFile,
} from '@alfred/contracts';
import { vi } from 'vitest';

import { createWorkspaceApi } from './workspace-api';

export const FILE_ID = '5a0f3b9e-1c2d-4e3f-8a4b-5c6d7e8f9a01';
export const SECOND_FILE_ID = '5a0f3b9e-1c2d-4e3f-8a4b-5c6d7e8f9a02';
export const FOLDER_ID = '6b1f4c0e-2d3e-4f40-9b5c-6d7e8f9a0b01';

/** Leading bytes the contract recognises, so a test file passes the browser's early check. */
export const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);
export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

export function pdfFile(name = 'rapport.pdf'): File {
  return new File([PDF_BYTES], name, { type: 'application/pdf' });
}

export function pngFile(name = 'capture.png'): File {
  return new File([PNG_BYTES], name, { type: 'image/png' });
}

export function storedFile(overrides: Partial<StoredFile> = {}): StoredFile {
  return {
    id: FILE_ID,
    name: 'rapport.pdf',
    kind: 'pdf',
    mediaType: 'application/pdf',
    sizeBytes: 2 * 1024 * 1024,
    readiness: 'ready',
    failureCode: null,
    folderId: null,
    tags: [],
    description: null,
    pageCount: 12,
    usage: { conversations: 0, messages: 0 },
    createdAt: '2026-09-18T09:00:00.000Z',
    updatedAt: '2026-09-18T09:00:00.000Z',
    ...overrides,
  };
}

export function fileFolder(overrides: Partial<FileFolder> = {}): FileFolder {
  return {
    id: FOLDER_ID,
    name: 'Contrats',
    parentId: null,
    depth: 1,
    fileCount: 0,
    createdAt: '2026-09-18T08:00:00.000Z',
    updatedAt: '2026-09-18T08:00:00.000Z',
    ...overrides,
  };
}

export interface FileCall {
  readonly method: string;
  /** Path with its query string, as the browser sent it. */
  readonly path: string;
  /** Parsed JSON, or the fields of a multipart upload. */
  readonly body: unknown;
  readonly headers: Headers;
}

interface Failure {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
}

interface FilesApiSeed {
  readonly files?: readonly StoredFile[];
  readonly folders?: readonly FileFolder[];
  readonly quota?: Partial<FileQuota>;
  /** The `fileUploads` capability; false hides every route behind 404, as the API does. */
  readonly enabled?: boolean;
  readonly features?: Partial<FeatureFlags>;
  /** Readiness an upload starts with. */
  readonly uploadReadiness?: StoredFile['readiness'];
  readonly pageSize?: number;
  readonly workspace?: Omit<NonNullable<Parameters<typeof createWorkspaceApi>[0]>, 'features'>;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
    status,
  });
const failure = ({ status, code, details }: Failure) =>
  json(
    { success: false, error: { code, message: 'Refused.', ...(details ? { details } : {}) } },
    status,
  );

/** In-memory stand-in for the files API on top of the workspace API, driven through `fetch`. */
export function createFilesApi(seed: FilesApiSeed = {}) {
  const enabled = seed.enabled ?? true;
  let files: StoredFile[] = [...(seed.files ?? [])];
  let folders: FileFolder[] = [...(seed.folders ?? [])];
  const calls: FileCall[] = [];
  const failures = new Map<string, Failure>();
  const holds = new Map<string, Promise<void>>();
  let sequence = 0;
  const nextId = () => {
    sequence += 1;
    return `7c2a5d1f-3e4f-4051-8c6d-${String(sequence).padStart(12, '0')}`;
  };
  const attachmentsOf = (ids: readonly string[]): MessageAttachment[] =>
    ids.flatMap((id) => {
      const file = files.find((item) => item.id === id);
      return file === undefined
        ? []
        : [
            {
              fileId: file.id,
              name: file.name,
              kind: file.kind,
              mediaType: file.mediaType,
              sizeBytes: file.sizeBytes,
              available: true,
              delivery: null,
              truncated: false,
            },
          ];
    });
  const workspace = createWorkspaceApi({
    ...seed.workspace,
    attachmentsOf,
    features: { ...seed.features, fileUploads: enabled },
  });
  const quota = (): FileQuota => ({
    usedBytes: files.reduce((total, file) => total + file.sizeBytes, 0),
    reservedBytes: 0,
    limitBytes: 25 * 1024 * 1024,
    maxFileBytes: 5 * 1024 * 1024,
    ...seed.quota,
  });

  const list = (url: URL) => {
    const query = url.searchParams;
    const search = (query.get('search') ?? '').toLowerCase();
    const folderId = query.get('folderId');
    const matching = files
      .filter(
        (file) =>
          file.name.toLowerCase().includes(search) &&
          (query.get('kind') === null || file.kind === query.get('kind')) &&
          (query.get('readiness') === null || file.readiness === query.get('readiness')) &&
          (folderId === null ||
            (folderId === 'root' ? file.folderId === null : file.folderId === folderId)) &&
          (query.get('conversationId') === null || file.usage.conversations > 0),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const offset = Number(query.get('cursor') ?? '0');
    const limit = seed.pageSize ?? Number(query.get('limit') ?? '20');
    return {
      items: matching.slice(offset, offset + limit),
      nextCursor: offset + limit < matching.length ? String(offset + limit) : null,
    };
  };

  const route = async (method: string, url: URL, init?: RequestInit): Promise<Response> => {
    const path = url.pathname;
    const hold = holds.get(`${method} ${path}`);
    if (hold !== undefined) await hold;
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const failed = failures.get(`${method} ${path}`);
    if (failed !== undefined) return failure(failed);
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    if (path === '/api/files' && method === 'GET') return json({ success: true, data: list(url) });
    if (path === '/api/files' && method === 'POST') {
      const form = init?.body as FormData;
      const uploaded = form.get('file') as File;
      const folderId = form.get('folderId');
      const created = storedFile({
        id: nextId(),
        name: uploaded.name,
        kind: uploaded.name.endsWith('.pdf')
          ? 'pdf'
          : uploaded.name.endsWith('.docx')
            ? 'docx'
            : 'image',
        mediaType: uploaded.type || 'application/octet-stream',
        sizeBytes: Math.max(1, uploaded.size),
        readiness: seed.uploadReadiness ?? 'ready',
        folderId: typeof folderId === 'string' ? folderId : null,
        pageCount: null,
        createdAt: new Date(Date.UTC(2026, 8, 18, 10, 0, sequence)).toISOString(),
        updatedAt: new Date(Date.UTC(2026, 8, 18, 10, 0, sequence)).toISOString(),
      });
      files = [created, ...files];
      return json({ success: true, data: { file: created, deduplicated: false } }, 201);
    }
    if (path === '/api/files/quota') return json({ success: true, data: quota() });
    if (path === '/api/files/folders' && method === 'GET')
      return json({
        success: true,
        data: {
          items: folders.map((folder) => ({
            ...folder,
            fileCount: files.filter((file) => file.folderId === folder.id).length,
          })),
        },
      });
    if (path === '/api/files/folders' && method === 'POST') {
      const parent = folders.find((folder) => folder.id === body.parentId);
      const created = fileFolder({
        id: nextId(),
        name: String(body.name),
        parentId: parent?.id ?? null,
        depth: (parent?.depth ?? 0) + 1,
      });
      folders = [...folders, created];
      return json({ success: true, data: created }, 201);
    }
    const folderMatch = /^\/api\/files\/folders\/([^/]+)$/u.exec(path);
    if (folderMatch !== null) {
      const folder = folders.find((item) => item.id === folderMatch[1]);
      if (folder === undefined) return failure({ status: 404, code: 'folder_not_found' });
      if (method === 'DELETE') {
        if (
          files.some((file) => file.folderId === folder.id) ||
          folders.some((item) => item.parentId === folder.id)
        )
          return failure({ status: 409, code: 'folder_not_empty' });
        folders = folders.filter((item) => item.id !== folder.id);
        return new Response(null, { status: 204 });
      }
      const updated: FileFolder = {
        ...folder,
        ...(typeof body.name === 'string' ? { name: body.name } : {}),
        ...('parentId' in body ? { parentId: body.parentId as string | null } : {}),
      };
      folders = folders.map((item) => (item.id === folder.id ? updated : item));
      return json({ success: true, data: updated });
    }
    const fileMatch = /^\/api\/files\/([^/]+)(?:\/(content|preview))?$/u.exec(path);
    if (fileMatch !== null) {
      const file = files.find((item) => item.id === fileMatch[1]);
      if (file === undefined) return failure({ status: 404, code: 'file_not_found' });
      if (fileMatch[2] !== undefined)
        return new Response(PNG_BYTES, {
          headers: {
            'content-disposition': 'attachment; filename="ignored-by-the-browser.bin"',
            'content-type': fileMatch[2] === 'preview' ? 'image/jpeg' : file.mediaType,
          },
          status: 200,
        });
      if (method === 'DELETE') {
        files = files.filter((item) => item.id !== file.id);
        return new Response(null, { status: 204 });
      }
      if (method === 'PATCH') {
        const updated: StoredFile = {
          ...file,
          ...(typeof body.name === 'string' ? { name: body.name } : {}),
          ...('folderId' in body ? { folderId: body.folderId as string | null } : {}),
          ...(Array.isArray(body.tags) ? { tags: body.tags as string[] } : {}),
          ...('description' in body ? { description: body.description as string | null } : {}),
          updatedAt: '2026-09-18T11:00:00.000Z',
        };
        files = files.map((item) => (item.id === file.id ? updated : item));
        return json({ success: true, data: updated });
      }
      return json({ success: true, data: file });
    }
    return failure({ status: 404, code: 'HTTP_404' });
  };

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    );
    if (!url.pathname.startsWith('/api/files')) return workspace.fetch(input, init);
    const method = (init?.method ?? 'GET').toUpperCase();
    const form = init?.body instanceof FormData ? init.body : null;
    calls.push({
      method,
      path: url.pathname + url.search,
      headers: new Headers(init?.headers),
      body:
        form !== null
          ? {
              fileName: (form.get('file') as File).name,
              folderId: form.get('folderId'),
              uploadId: form.get('uploadId'),
            }
          : typeof init?.body === 'string'
            ? (JSON.parse(init.body) as unknown)
            : undefined,
    });
    await Promise.resolve();
    if (!enabled) return failure({ status: 404, code: 'HTTP_404' });
    return route(method, url, init);
  });

  return {
    ...workspace,
    fetch,
    /** Every request made to `/api/files…`, in order. */
    fileCalls: calls,
    get files() {
      return files;
    },
    get folders() {
      return folders;
    },
    /** Makes `METHOD /api/files…` fail until `recoverFiles()`. */
    failFiles(request: string, status: number, code: string, details?: Record<string, unknown>) {
      failures.set(request, { status, code, ...(details ? { details } : {}) });
    },
    recoverFiles() {
      failures.clear();
    },
    /** Keeps `METHOD /api/files…` pending until the returned function is called. */
    holdFiles(request: string): () => void {
      let release = () => undefined as void;
      holds.set(
        request,
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      );
      return () => {
        holds.delete(request);
        release();
      };
    },
    /** What the extraction worker would do: the file leaves `processing`. */
    settle(fileId: string, readiness: StoredFile['readiness'] = 'ready') {
      files = files.map((file) =>
        file.id === fileId
          ? {
              ...file,
              readiness,
              failureCode: readiness === 'failed' ? 'parser_error' : null,
              updatedAt: '2026-09-18T12:00:00.000Z',
            }
          : file,
      );
    },
  };
}
