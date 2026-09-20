import type { StoredFile, UpdateFileInput } from '@alfred/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { refreshFileLibrary } from '@/hooks/files/file-cache';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { fileKeys } from '@/hooks/workspace/workspace-keys';
import { downloadBlob } from '@/lib/browser/download-blob';
import { fileError } from '@/lib/files/file-errors';
import { deleteFile, getFileContent, updateFile } from '@/services/files/files.service';

export type PendingFileAction =
  | { readonly type: 'rename' | 'details'; readonly files: readonly [StoredFile] }
  | { readonly type: 'move' | 'delete'; readonly files: readonly StoredFile[] };

/** State handed to `FileActionDialogs`; the dialogs themselves stay presentational. */
export interface FileActionDialogsState {
  readonly pending: PendingFileAction | null;
  readonly isPending: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onRename: (name: string) => void;
  /** `null` moves to the top level of the library. */
  readonly onMove: (folderId: string | null) => void;
  readonly onSaveDetails: (input: Pick<UpdateFileInput, 'tags' | 'description'>) => void;
  readonly onConfirmDelete: () => void;
}

interface UseFileActionsOptions {
  /** After a deletion, for example to drop the chips and the selection that named the files. */
  readonly onDeleted?: (fileIds: readonly string[]) => void;
  /** After a rename, a move or an edit: whoever shows the file elsewhere follows. */
  readonly onUpdated?: (file: StoredFile) => void;
}

const FALLBACKS = {
  rename: 'Impossible de renommer ce fichier.',
  details: 'Impossible d’enregistrer ces informations.',
  move: 'Impossible de déplacer ce fichier.',
  delete: 'Impossible de supprimer ce fichier.',
} as const;

/** Download, rename, move, describe and delete library files, one or several at a time. */
export function useFileActions({ onDeleted, onUpdated }: UseFileActionsOptions = {}) {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingFileAction | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const open = (action: PendingFileAction) => {
    setError(null);
    setNotice(null);
    setDownloadError(null);
    setPending(action);
  };
  const close = () => {
    setPending(null);
    setError(null);
  };

  /**
   * Applies `change` to each file in turn and stops at the first refusal, saying how far it got:
   * a selection is never left half done without a word.
   */
  async function run(
    action: PendingFileAction,
    change: (file: StoredFile) => Promise<void>,
    done: (count: number) => string,
  ) {
    setIsPending(true);
    setError(null);
    let count = 0;
    try {
      for (const file of action.files) {
        await change(file);
        count += 1;
      }
      if (!mounted.current) return;
      setPending(null);
      setNotice(done(count));
    } catch (reason) {
      if (!mounted.current) return;
      const message = fileError(reason, FALLBACKS[action.type]);
      setError(
        action.files.length > 1
          ? `${message} ${count} fichier${count > 1 ? 's' : ''} sur ${action.files.length} traité${count > 1 ? 's' : ''}.`
          : message,
      );
    } finally {
      await refreshFileLibrary(queryClient, userId);
      if (mounted.current) setIsPending(false);
    }
  }

  const update = (action: PendingFileAction, input: UpdateFileInput, done: (n: number) => string) =>
    run(
      action,
      async (file) => {
        const updated = await updateFile(client, file.id, input);
        queryClient.setQueryData(fileKeys.detail(userId, updated.id), updated);
        onUpdated?.(updated);
      },
      done,
    );

  const dialogs: FileActionDialogsState = {
    pending,
    isPending,
    error,
    onClose: close,
    onRename: (name) => {
      if (pending?.type === 'rename' && !isPending)
        void update(pending, { name }, () => 'Fichier renommé.');
    },
    onMove: (folderId) => {
      if (pending?.type === 'move' && !isPending)
        void update(pending, { folderId }, (count) =>
          count > 1 ? `${count} fichiers déplacés.` : 'Fichier déplacé.',
        );
    },
    onSaveDetails: (input) => {
      if (pending?.type === 'details' && !isPending)
        void update(pending, input, () => 'Informations enregistrées.');
    },
    onConfirmDelete: () => {
      if (pending?.type !== 'delete' || isPending) return;
      const deleted: string[] = [];
      void run(
        pending,
        async (file) => {
          await deleteFile(client, file.id);
          deleted.push(file.id);
          queryClient.removeQueries({ queryKey: fileKeys.detail(userId, file.id) });
          queryClient.removeQueries({ queryKey: fileKeys.preview(userId, file.id) });
        },
        (count) => (count > 1 ? `${count} fichiers supprimés.` : 'Fichier supprimé.'),
      ).finally(() => {
        if (deleted.length > 0) onDeleted?.(deleted);
      });
    },
  };

  return {
    dialogs,
    /** Outcome of the last action, announced by the caller's live region. */
    notice,
    downloadError,
    rename: (file: StoredFile) => open({ type: 'rename', files: [file] }),
    editDetails: (file: StoredFile) => open({ type: 'details', files: [file] }),
    move: (files: readonly StoredFile[]) => open({ type: 'move', files }),
    remove: (files: readonly StoredFile[]) => open({ type: 'delete', files }),
    /** The row names the download: `Content-Disposition` is never read. */
    download: async (file: StoredFile) => {
      setDownloadError(null);
      setNotice(null);
      try {
        downloadBlob(await getFileContent(client, file.id), file.name);
      } catch (reason) {
        if (mounted.current)
          setDownloadError(fileError(reason, `Impossible de télécharger « ${file.name} ».`));
      }
    },
  };
}
