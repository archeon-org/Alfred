import { describe, expect, it, vi } from 'vitest';

import {
  createFolder,
  deleteFile,
  deleteFolder,
  FILE_PAGE_SIZE,
  getFile,
  getFileContent,
  getFilePreview,
  getFileQuota,
  listFiles,
  listFolders,
  updateFile,
  updateFolder,
  uploadFile,
} from '@/services/files/files.service';
import { createExecution } from '@/services/executions/executions.service';
import { FILE_ID, FOLDER_ID, fileFolder, pdfFile, storedFile } from '../../../support/files-api';
import { CONVERSATION_ID } from '../../../support/workspace-api';

type Request = (path: string, init?: RequestInit) => Promise<Response>;

function client(data: unknown, status = 200) {
  return {
    request: vi.fn<Request>(() =>
      Promise.resolve(
        status === 204
          ? new Response(null, { status })
          : new Response(JSON.stringify(data), { status }),
      ),
    ),
  };
}
const ok = (data: unknown) => ({ success: true, data });
const page = ok({ items: [storedFile()], nextCursor: 'next' });

describe('Files HTTP boundary', () => {
  it('lists the whole library without any filter', async () => {
    const http = client(page);
    await expect(listFiles(http)).resolves.toEqual({ items: [storedFile()], nextCursor: 'next' });
    expect(http.request).toHaveBeenCalledWith(
      `/files?limit=${FILE_PAGE_SIZE}`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(new Headers(http.request.mock.calls[0]?.[1]?.headers).has('content-type')).toBe(false);
  });

  it.each([
    [{ search: 'bilan 2026' }, 'search=bilan+2026'],
    [{ kind: 'image' as const }, 'kind=image'],
    [{ readiness: 'processing' as const }, 'readiness=processing'],
    [{ folderId: 'root' as const }, 'folderId=root'],
    [{ folderId: FOLDER_ID }, `folderId=${FOLDER_ID}`],
    [{ conversationId: CONVERSATION_ID }, `conversationId=${CONVERSATION_ID}`],
    [{ tag: 'contrat' }, 'tag=contrat'],
  ])('sends %o as the query %s', async (filters, query) => {
    const http = client(page);
    await listFiles(http, filters);
    expect(http.request.mock.calls[0]?.[0]).toBe(`/files?${query}&limit=${FILE_PAGE_SIZE}`);
  });

  it('combines filters with the cursor and leaves empty text out', async () => {
    const http = client(page);
    await listFiles(http, { search: '', tag: '', kind: 'pdf', readiness: 'ready' }, 'abc');
    expect(http.request.mock.calls[0]?.[0]).toBe(
      `/files?kind=pdf&readiness=ready&cursor=abc&limit=${FILE_PAGE_SIZE}`,
    );
  });

  it('uploads one file as multipart data, without a content type of its own', async () => {
    const http = client(ok({ file: storedFile(), deduplicated: false }), 201);
    const signal = new AbortController().signal;
    const uploadId = '7c2a5d1f-3e4f-4051-8c6d-000000000001';
    await expect(
      uploadFile(http, { file: pdfFile(), folderId: FOLDER_ID, uploadId }, signal),
    ).resolves.toEqual({ file: storedFile(), deduplicated: false });

    const [path, init] = http.request.mock.calls[0]!;
    expect(path).toBe('/files');
    expect(init).toMatchObject({ method: 'POST', retryOnUnauthorized: true, signal });
    // The browser writes `multipart/form-data; boundary=…` itself.
    expect(new Headers(init?.headers).has('content-type')).toBe(false);
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect((form.get('file') as File).name).toBe('rapport.pdf');
    expect(form.get('uploadId')).toBe(uploadId);
    expect(form.get('folderId')).toBe(FOLDER_ID);
  });

  it('leaves the folder out of an upload to the top level', async () => {
    const http = client(ok({ file: storedFile(), deduplicated: true }), 201);
    await uploadFile(http, { file: pdfFile(), folderId: null, uploadId: 'u' });
    expect((http.request.mock.calls[0]?.[1]?.body as FormData).has('folderId')).toBe(false);
  });

  it('keeps the business code and the details of a refused upload', async () => {
    const http = client(
      {
        success: false,
        error: {
          code: 'quota_exceeded',
          message: 'Quota exceeded.',
          details: { usedBytes: 1, reservedBytes: 0, limitBytes: 2 },
        },
      },
      409,
    );
    await expect(uploadFile(http, { file: pdfFile(), uploadId: 'u' })).rejects.toMatchObject({
      status: 409,
      code: 'quota_exceeded',
      details: { limitBytes: 2 },
    });
  });

  it('downloads content and previews as bytes through the client', async () => {
    // A fresh response per call: a body can be read once.
    const http = {
      request: vi.fn<Request>(() =>
        Promise.resolve(
          new Response('%PDF-', { headers: { 'content-type': 'application/pdf' }, status: 200 }),
        ),
      ),
    };
    const content = await getFileContent(http, FILE_ID);
    expect(await content.text()).toBe('%PDF-');
    expect(http.request).toHaveBeenLastCalledWith(
      `/files/${FILE_ID}/content`,
      expect.objectContaining({ method: 'GET' }),
    );
    await getFilePreview(http, FILE_ID);
    expect(http.request).toHaveBeenLastCalledWith(`/files/${FILE_ID}/preview`, expect.anything());
  });

  it('reports purged content with its code', async () => {
    const http = client(
      { success: false, error: { code: 'file_content_purged', message: 'Gone.' } },
      410,
    );
    await expect(getFileContent(http, FILE_ID)).rejects.toMatchObject({
      status: 410,
      code: 'file_content_purged',
    });
  });

  it('reads, updates and deletes one file', async () => {
    const http = client(ok(storedFile({ name: 'bilan.pdf' })));
    await expect(getFile(http, FILE_ID)).resolves.toMatchObject({ name: 'bilan.pdf' });
    await updateFile(http, FILE_ID, { name: 'bilan.pdf', folderId: null, tags: ['a'] });
    const [path, init] = http.request.mock.calls[1]!;
    expect(path).toBe(`/files/${FILE_ID}`);
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      name: 'bilan.pdf',
      folderId: null,
      tags: ['a'],
    });
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');

    const gone = client(undefined, 204);
    await expect(deleteFile(gone, FILE_ID)).resolves.toBeUndefined();
    expect(gone.request).toHaveBeenCalledWith(
      `/files/${FILE_ID}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('reads the quota and manages folders', async () => {
    const quota = { usedBytes: 1, reservedBytes: 2, limitBytes: 3, maxFileBytes: 4 };
    await expect(getFileQuota(client(ok(quota)))).resolves.toEqual(quota);
    await expect(listFolders(client(ok({ items: [fileFolder()] })))).resolves.toEqual([
      fileFolder(),
    ]);

    const http = client(ok(fileFolder()), 201);
    await createFolder(http, { name: 'Contrats', parentId: FOLDER_ID });
    expect(http.request.mock.calls[0]?.[0]).toBe('/files/folders');
    expect(JSON.parse(http.request.mock.calls[0]?.[1]?.body as string)).toEqual({
      name: 'Contrats',
      parentId: FOLDER_ID,
    });
    await updateFolder(http, FOLDER_ID, { parentId: null });
    expect(http.request.mock.calls[1]?.[0]).toBe(`/files/folders/${FOLDER_ID}`);
    expect(http.request.mock.calls[1]?.[1]?.method).toBe('PATCH');

    const gone = client(undefined, 204);
    await deleteFolder(gone, FOLDER_ID);
    expect(gone.request.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it.each([
    ['a list', () => listFiles(client(ok({ items: [{ id: 'x' }], nextCursor: null })))],
    ['a file', () => getFile(client(ok({ id: FILE_ID })), FILE_ID)],
    [
      'an upload',
      () => uploadFile(client(ok({ file: storedFile() }), 201), { file: pdfFile(), uploadId: 'u' }),
    ],
    ['a quota', () => getFileQuota(client(ok({ usedBytes: -1 })))],
    ['folders', () => listFolders(client(ok({ items: [{ id: 'x' }] })))],
    ['a folder', () => createFolder(client(ok({ id: 'x' }), 201), { name: 'x' })],
  ])('fails closed on %s that does not match the contract', async (_label, call) => {
    await expect(call()).rejects.toThrow(/invalide/u);
  });
});

describe('attachments on an execution', () => {
  const snapshot = {
    success: true,
    data: { snapshot: null },
  };

  it('names the files of the message, and omits the field without any', async () => {
    // The response is malformed on purpose: only the request body matters here.
    const http = client(snapshot, 202);
    const signal = new AbortController().signal;
    await createExecution(http, CONVERSATION_ID, 'Salut', 's1', signal, [FILE_ID]).catch(
      () => undefined,
    );
    await createExecution(http, CONVERSATION_ID, 'Salut', 's2', signal).catch(() => undefined);
    await createExecution(http, CONVERSATION_ID, 'Salut', 's3', signal, []).catch(() => undefined);
    const bodies = http.request.mock.calls.map(
      ([, init]) => JSON.parse(init?.body as string) as Record<string, unknown>,
    );
    expect(bodies[0]).toEqual({ message: 'Salut', submissionId: 's1', attachmentIds: [FILE_ID] });
    expect(bodies[1]).toEqual({ message: 'Salut', submissionId: 's2' });
    expect(bodies[2]).toEqual({ message: 'Salut', submissionId: 's3' });
  });
});
