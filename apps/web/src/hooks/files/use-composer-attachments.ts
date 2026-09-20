import type { StoredFile } from '@alfred/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer } from 'react';

import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { fileKeys } from '@/hooks/workspace/workspace-keys';
import {
  attachmentsOf,
  attachmentStoreReducer,
  EMPTY_ATTACHMENT_STORE,
  type AttachmentEntry,
} from '@/lib/files/attachment-store';
import {
  attachmentLimitReason,
  type ComposerAttachment,
  type ComposerAttachmentsControls,
} from '@/lib/files/composer-attachments';
import { kindFromName } from '@/lib/files/file-kinds';
import type { FileUploadManager } from '@/lib/files/file-upload';

/** Chips of every composer of the workspace; a screen asks for the ones of its own composer. */
export interface ComposerAttachmentStore {
  readonly forScope: (scope: string) => ComposerAttachmentsControls;
  /** Chips for ids handed over by the router; the API names them when the cache cannot. */
  readonly adopt: (scope: string, fileIds: readonly string[]) => void;
  /** Files deleted from the library: no composer keeps a chip for them. */
  readonly forget: (fileIds: readonly string[]) => void;
  /** A file renamed or analysed since it was attached: its chips show the new state. */
  readonly settle: (file: StoredFile) => void;
}

/** The composer of a chat that does not exist yet, per creation target. */
export function freshComposerScope(projectId?: string): string {
  return `new:${projectId ?? 'standalone'}`;
}

const composerOwner = (scope: string) => `composer:${scope}`;

function refusedNotice(refused: number, reason: string): string {
  return refused === 1
    ? `Un fichier n’a pas été ajouté. ${reason}`
    : `${refused} fichiers n’ont pas été ajoutés. ${reason}`;
}

/**
 * The files waiting in each composer. Mounted with the workspace frame so that the context
 * panel, the file explorer and the composer itself reach the same chips, and so that a chip
 * survives a change of screen. Nothing is persisted: the chips live in React memory only.
 */
export function useComposerAttachments(uploads: FileUploadManager): ComposerAttachmentStore {
  const { userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(attachmentStoreReducer, EMPTY_ATTACHMENT_STORE);
  useEffect(() => () => dispatch({ type: 'reset' }), [userId]);
  const settle = useCallback((file: StoredFile) => dispatch({ type: 'settled', file }), []);

  const forScope = (scope: string): ComposerAttachmentsControls => {
    const items = attachmentsOf(state, scope, uploads.items);
    const entryOf = (localId: string) =>
      state.scopes[scope]?.find((entry) => entry.localId === localId);
    return {
      items,
      notice: state.notices[scope] ?? null,
      addFiles: (files) => {
        const accepted: File[] = [];
        const counted: Pick<ComposerAttachment, 'kind'>[] = [...items];
        let reason: string | null = null;
        for (const file of files) {
          const kind = kindFromName(file.name);
          const refusal = attachmentLimitReason(counted, kind);
          if (refusal === null) {
            accepted.push(file);
            counted.push({ kind });
          } else reason ??= refusal;
        }
        const ids =
          accepted.length > 0 ? uploads.add(accepted, { owner: composerOwner(scope) }) : [];
        dispatch({
          type: 'added',
          scope,
          entries: ids.map((localId) => ({ localId, source: 'upload' })),
          notice: reason === null ? null : refusedNotice(files.length - accepted.length, reason),
        });
      },
      attachStored: (file) => {
        const refusal = items.some((item) => item.fileId === file.id)
          ? 'Ce fichier est déjà joint au message.'
          : file.readiness === 'processing'
            ? 'Ce fichier est encore en cours d’analyse.'
            : file.readiness === 'failed'
              ? 'Ce fichier n’a pas pu être analysé : il ne peut pas être joint.'
              : attachmentLimitReason(items, file.kind);
        if (refusal !== null) {
          dispatch({ type: 'noticed', scope, notice: refusal });
          return refusal;
        }
        dispatch({
          type: 'added',
          scope,
          entries: [{ fileId: file.id, localId: file.id, snapshot: file, source: 'library' }],
          notice: `« ${file.name} » est joint au prochain message.`,
        });
        return null;
      },
      remove: (localId) => {
        // An upload in flight is cancelled; a library file only leaves the message.
        if (entryOf(localId)?.source === 'upload') uploads.remove(localId);
        dispatch({ type: 'removed', scope, localIds: [localId] });
      },
      retry: (localId) => uploads.retry(localId),
      settle,
      markUnavailable: (fileId, error) => dispatch({ type: 'unavailable', fileId, error }),
      clear: (localIds) => {
        for (const localId of localIds)
          if (entryOf(localId)?.source === 'upload') uploads.remove(localId);
        dispatch({ type: 'removed', scope, localIds });
      },
    };
  };

  const adopt = useCallback(
    (scope: string, fileIds: readonly string[]) => {
      const entries = fileIds.map((fileId): AttachmentEntry => ({
        fileId,
        localId: fileId,
        snapshot: queryClient.getQueryData<StoredFile>(fileKeys.detail(userId, fileId)) ?? null,
        source: 'library',
      }));
      if (entries.length > 0) dispatch({ type: 'added', scope, entries, notice: null });
    },
    [queryClient, userId],
  );
  const forget = useCallback(
    (fileIds: readonly string[]) => dispatch({ type: 'forgotten', fileIds }),
    [],
  );

  return { adopt, forget, forScope, settle };
}
