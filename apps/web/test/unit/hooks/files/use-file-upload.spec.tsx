import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_CONCURRENT_UPLOADS, useFileUpload } from '@/hooks/files/use-file-upload';
import { fileKeys } from '@/hooks/workspace/workspace-keys';
import { LIBRARY_UPLOADS } from '@/lib/files/file-upload';
import { uploadFile, type FileUploadResult } from '@/services/files/files.service';
import { ApiRequestError } from '@/services/http/api-json';
import { FOLDER_ID, pdfFile, pngFile, storedFile } from '../../../support/files-api';

vi.mock('@/hooks/workspace/use-workspace-account', () => ({
  useWorkspaceAccount: () => ({ client: { request: vi.fn() }, userId: 'user-1' }),
}));
vi.mock('@/services/files/files.service', () => ({ uploadFile: vi.fn() }));
const mockedUpload = vi.mocked(uploadFile);

afterEach(() => {
  mockedUpload.mockReset();
});

function deferred() {
  let resolve: (value: FileUploadResult) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<FileUploadResult>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, reject, resolve };
}
const result = (name = 'rapport.pdf'): FileUploadResult => ({
  deduplicated: false,
  file: storedFile({ name }),
});

function renderUploads() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(() => useFileUpload(), { wrapper }) };
}
const library = { owner: LIBRARY_UPLOADS };

describe('useFileUpload', () => {
  it.each([
    ['an HTML page named .png', new File(['<!doctype html>'], 'photo.png'), /Format non pris/u],
    ['an unknown extension', new File(['%PDF-1.7'], 'notes.txt'), /Format non pris/u],
    ['an empty file', new File([], 'vide.pdf'), /vide/u],
  ])('never sends %s to the service', async (_label, file, reason) => {
    const { result: hook } = renderUploads();
    act(() => void hook.current.add([file], library));
    await waitFor(() => expect(hook.current.items[0]?.status).toBe('failed'));
    expect(hook.current.items[0]).toMatchObject({ retryable: false });
    expect(hook.current.items[0]?.error).toMatch(reason);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('honours the file size the API announced in the quota', async () => {
    const { result: hook, queryClient } = renderUploads();
    queryClient.setQueryData(fileKeys.quota('user-1'), {
      usedBytes: 0,
      reservedBytes: 0,
      limitBytes: 1024,
      maxFileBytes: 4,
    });
    act(() => void hook.current.add([pdfFile()], library));
    await waitFor(() => expect(hook.current.items[0]?.status).toBe('failed'));
    expect(hook.current.items[0]?.error).toBe('Ce fichier dépasse 4 octets.');
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('checks, sends and hands the library file over, seeding its cache entry', async () => {
    const pending = deferred();
    mockedUpload.mockReturnValueOnce(pending.promise);
    const { result: hook, queryClient } = renderUploads();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    let ids: readonly string[] = [];
    act(() => {
      ids = hook.current.add([pngFile()], { owner: 'composer:c1', folderId: FOLDER_ID });
    });
    expect(hook.current.items[0]).toMatchObject({
      status: 'validating',
      owner: 'composer:c1',
      kind: 'image',
    });
    await waitFor(() => expect(hook.current.items[0]?.status).toBe('uploading'));
    expect(mockedUpload).toHaveBeenCalledWith(
      expect.anything(),
      { file: expect.any(File) as File, folderId: FOLDER_ID, uploadId: ids[0] },
      expect.any(AbortSignal),
    );
    await act(async () => {
      pending.resolve(result('capture.png'));
      await pending.promise;
    });
    expect(hook.current.items[0]).toMatchObject({
      status: 'done',
      file: { name: 'capture.png' },
    });
    expect(queryClient.getQueryData(fileKeys.detail('user-1', storedFile().id))).toMatchObject({
      name: 'capture.png',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: fileKeys.lists('user-1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: fileKeys.quota('user-1') });
  });

  it('keeps at most two uploads in flight and starts the next when one ends', async () => {
    const first = deferred();
    mockedUpload.mockReturnValueOnce(first.promise).mockReturnValue(new Promise(() => undefined));
    const { result: hook } = renderUploads();
    act(
      () => void hook.current.add([pdfFile('a.pdf'), pdfFile('b.pdf'), pdfFile('c.pdf')], library),
    );
    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(MAX_CONCURRENT_UPLOADS));
    await waitFor(() =>
      expect(hook.current.items.map((item) => item.status)).toEqual([
        'uploading',
        'uploading',
        'uploading',
      ]),
    );
    expect(mockedUpload).toHaveBeenCalledTimes(2);
    await act(async () => {
      first.resolve(result('a.pdf'));
      await first.promise;
    });
    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(3));
  });

  it('aborts an upload that is removed, without reporting a failure', async () => {
    let signal: AbortSignal | undefined;
    mockedUpload.mockImplementationOnce((_client, _request, given) => {
      signal = given;
      return new Promise((_resolve, reject) => {
        given?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });
    const { result: hook, queryClient } = renderUploads();
    const invalidated = vi.spyOn(queryClient, 'invalidateQueries');
    let ids: readonly string[] = [];
    act(() => {
      ids = hook.current.add([pdfFile()], library);
    });
    await waitFor(() => expect(mockedUpload).toHaveBeenCalledOnce());
    act(() => hook.current.remove(ids[0]!));
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(hook.current.items).toEqual([]));
    // An abort that arrives once the file is published changes nothing on the server: the
    // library and the quota are read again, so such a file is listed instead of hidden.
    const keys = invalidated.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(keys.some((key) => key.includes('quota'))).toBe(true);
    expect(keys.length).toBeGreaterThanOrEqual(3);
  });

  it('does not read the library again for an upload removed before it was sent', async () => {
    mockedUpload.mockImplementation(() => new Promise(() => undefined));
    const { result: hook, queryClient } = renderUploads();
    const invalidated = vi.spyOn(queryClient, 'invalidateQueries');
    let ids: readonly string[] = [];
    act(() => {
      ids = hook.current.add([pdfFile('a.pdf'), pdfFile('b.pdf'), pdfFile('c.pdf')], library);
    });
    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(MAX_CONCURRENT_UPLOADS));

    // The third file is still queued: nothing was sent, so nothing can have been published.
    act(() => hook.current.remove(ids[2]!));
    expect(invalidated).not.toHaveBeenCalled();
  });

  it('retries with the same uploadId, so a retry never charges the quota twice', async () => {
    mockedUpload
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(result());
    const { result: hook } = renderUploads();
    let ids: readonly string[] = [];
    act(() => {
      ids = hook.current.add([pdfFile()], library);
    });
    await waitFor(() => expect(hook.current.items[0]?.status).toBe('failed'));
    expect(hook.current.items[0]).toMatchObject({
      retryable: true,
      error: 'Impossible d’envoyer le fichier. Vérifiez la connexion et réessayez.',
    });
    act(() => hook.current.retry(ids[0]!));
    await waitFor(() => expect(hook.current.items[0]?.status).toBe('done'));
    expect(mockedUpload).toHaveBeenCalledTimes(2);
    expect(mockedUpload.mock.calls.map(([, request]) => request.uploadId)).toEqual([
      ids[0],
      ids[0],
    ]);
    // Nothing is left to retry once the file is in the library.
    act(() => hook.current.retry(ids[0]!));
    expect(mockedUpload).toHaveBeenCalledTimes(2);
  });

  it('explains a full quota and lets the person retry after making room', async () => {
    mockedUpload.mockRejectedValueOnce(
      new ApiRequestError(409, 'quota_exceeded', 'Quota exceeded.', {
        usedBytes: 26_000_000,
        reservedBytes: 0,
        limitBytes: 25 * 1024 * 1024,
      }),
    );
    const { result: hook } = renderUploads();
    act(() => void hook.current.add([pdfFile()], library));
    await waitFor(() => expect(hook.current.items[0]?.status).toBe('failed'));
    expect(hook.current.items[0]).toMatchObject({
      retryable: true,
      error: 'Votre espace de fichiers est plein (25 Mio). Supprimez des fichiers pour continuer.',
    });
  });

  it('marks a refusal of the content as final', async () => {
    mockedUpload.mockRejectedValueOnce(new ApiRequestError(422, 'file_rejected', 'Rejected.'));
    const { result: hook } = renderUploads();
    act(() => void hook.current.add([pdfFile()], library));
    await waitFor(() => expect(hook.current.items[0]?.status).toBe('failed'));
    expect(hook.current.items[0]?.retryable).toBe(false);
  });

  it('aborts what is in flight when the workspace unmounts', async () => {
    let signal: AbortSignal | undefined;
    mockedUpload.mockImplementationOnce((_client, _request, given) => {
      signal = given;
      return new Promise(() => undefined);
    });
    const { result: hook, unmount } = renderUploads();
    act(() => void hook.current.add([pdfFile()], library));
    await waitFor(() => expect(mockedUpload).toHaveBeenCalledOnce());
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
