import {
  FILE_MAX_BYTES,
  FILE_MAX_CONCURRENT_UPLOADS_PER_USER,
  type FileQuota,
} from '@alfred/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import { refreshFileLibrary } from '@/hooks/files/file-cache';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { fileKeys } from '@/hooks/workspace/workspace-keys';
import { fileError, fileRejectionMessage, isRetryableUpload } from '@/lib/files/file-errors';
import { kindFromName, readFileSignature, validateFile } from '@/lib/files/file-kinds';
import {
  fileUploadReducer,
  type FileUploadManager,
  type FileUploadOptions,
} from '@/lib/files/file-upload';
import { uploadFile } from '@/services/files/files.service';

/** Two requests at most: a drop of many files never saturates the connection or the API. */
export const MAX_CONCURRENT_UPLOADS = FILE_MAX_CONCURRENT_UPLOADS_PER_USER;

interface UploadJob {
  readonly file: File;
  readonly folderId: string | null;
  controller: AbortController | null;
}

/**
 * The workspace's uploads: each file is checked in the browser, then sent alone, two at a time.
 * Mounted with the workspace frame, so an upload survives a closed panel or a change of screen;
 * leaving the workspace or changing account aborts what is still in flight.
 */
export function useFileUpload(): FileUploadManager {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  const [items, dispatch] = useReducer(fileUploadReducer, []);
  const jobs = useRef(new Map<string, UploadJob>());
  const queue = useRef<string[]>([]);
  const active = useRef(0);
  // A queued file is sent with the client of the moment, never with a stale token.
  const currentClient = useRef(client);
  useEffect(() => {
    currentClient.current = client;
  }, [client]);

  useEffect(() => {
    const running = jobs.current;
    const waiting = queue.current;
    return () => {
      for (const job of running.values()) job.controller?.abort();
      running.clear();
      waiting.length = 0;
      dispatch({ type: 'reset' });
    };
  }, [userId]);

  const send = useCallback(
    async (uploadId: string, job: UploadJob) => {
      const controller = new AbortController();
      job.controller = controller;
      try {
        const { file } = await uploadFile(
          currentClient.current,
          { file: job.file, folderId: job.folderId, uploadId },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        jobs.current.delete(uploadId);
        queryClient.setQueryData(fileKeys.detail(userId, file.id), file);
        dispatch({ type: 'done', uploadId, file });
        void refreshFileLibrary(queryClient, userId);
      } catch (reason) {
        if (controller.signal.aborted) return;
        dispatch({
          type: 'failed',
          uploadId,
          error: fileError(reason),
          retryable: isRetryableUpload(reason),
        });
      } finally {
        job.controller = null;
      }
    },
    [queryClient, userId],
  );

  // A finished upload starts the next one through this reference to the latest `pump`.
  const next = useRef<() => void>(() => undefined);
  const pump = useCallback(() => {
    while (active.current < MAX_CONCURRENT_UPLOADS && queue.current.length > 0) {
      const uploadId = queue.current.shift() as string;
      const job = jobs.current.get(uploadId);
      if (job === undefined) continue;
      active.current += 1;
      void send(uploadId, job).finally(() => {
        active.current -= 1;
        next.current();
      });
    }
  }, [send]);
  useEffect(() => {
    next.current = pump;
  }, [pump]);

  const check = useCallback(
    async (uploadId: string, file: File) => {
      // The API may be configured with another file size than the contract's default.
      const maxBytes =
        queryClient.getQueryData<FileQuota>(fileKeys.quota(userId))?.maxFileBytes ?? FILE_MAX_BYTES;
      const result = await readFileSignature(file).then(
        (signature) => validateFile(file, signature, maxBytes),
        () => ({ ok: false, reason: 'unreadable' }) as const,
      );
      // Removed while its bytes were read.
      if (!jobs.current.has(uploadId)) return;
      if (!result.ok) {
        // A refused file never reaches the service, and sending it again cannot succeed.
        jobs.current.delete(uploadId);
        dispatch({
          type: 'failed',
          uploadId,
          error: fileRejectionMessage(result.reason, maxBytes),
          retryable: false,
        });
        return;
      }
      dispatch({ type: 'validated', uploadId, kind: result.kind });
      queue.current.push(uploadId);
      pump();
    },
    [pump, queryClient, userId],
  );

  const add = useCallback(
    (files: readonly File[], { owner, folderId = null }: FileUploadOptions) => {
      const added = files.map((file) => ({ file, uploadId: crypto.randomUUID() }));
      dispatch({
        type: 'added',
        items: added.map(({ file, uploadId }) => ({
          error: null,
          file: null,
          kind: kindFromName(file.name),
          name: file.name,
          owner,
          retryable: false,
          status: 'validating' as const,
          uploadId,
        })),
      });
      for (const { file, uploadId } of added) {
        jobs.current.set(uploadId, { controller: null, file, folderId });
        void check(uploadId, file);
      }
      return added.map(({ uploadId }) => uploadId);
    },
    [check],
  );

  const retry = useCallback(
    (uploadId: string) => {
      const job = jobs.current.get(uploadId);
      if (job === undefined || job.controller !== null || queue.current.includes(uploadId)) return;
      dispatch({ type: 'retried', uploadId });
      queue.current.push(uploadId);
      pump();
    },
    [pump],
  );

  const remove = useCallback(
    (uploadId: string) => {
      const inFlight = jobs.current.get(uploadId)?.controller ?? null;
      inFlight?.abort();
      jobs.current.delete(uploadId);
      queue.current = queue.current.filter((queued) => queued !== uploadId);
      dispatch({ type: 'removed', uploadId });
      // The API drops an upload its client abandoned, but an abort that arrives once the file is
      // published changes nothing: the library is read again, so that such a file is listed and
      // can be deleted instead of silently holding quota.
      if (inFlight !== null) void refreshFileLibrary(queryClient, userId);
    },
    [queryClient, userId],
  );

  return useMemo(() => ({ add, items, remove, retry }), [add, items, remove, retry]);
}
