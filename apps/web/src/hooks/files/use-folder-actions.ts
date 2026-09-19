import type { FileFolder } from '@alfred/contracts';
import { useState } from 'react';

import { useFolderMutations } from '@/hooks/files/use-file-folders';
import { fileError } from '@/lib/files/file-errors';

export type PendingFolderAction =
  | { readonly type: 'create'; readonly parentId: string | null }
  | { readonly type: 'rename' | 'move' | 'delete'; readonly folder: FileFolder };

/** State handed to `FolderActionDialogs`. */
export interface FolderActionDialogsState {
  readonly pending: PendingFolderAction | null;
  readonly isPending: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmitName: (name: string) => void;
  /** `null` moves the folder to the top level. */
  readonly onMove: (parentId: string | null) => void;
  readonly onConfirmDelete: () => void;
}

interface UseFolderActionsOptions {
  /** After a deletion, for example to leave the pages of the deleted folder. */
  readonly onDeleted?: (folder: FileFolder) => void;
}

/** Create, rename, move and delete the folders that organise the library. */
export function useFolderActions({ onDeleted }: UseFolderActionsOptions = {}) {
  const { create, remove, update } = useFolderMutations();
  const [pending, setPending] = useState<PendingFolderAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const open = (action: PendingFolderAction) => {
    create.reset();
    update.reset();
    remove.reset();
    setNotice(null);
    setPending(action);
  };
  const finish = (message: string) => () => {
    setPending(null);
    setNotice(message);
  };
  const failure =
    pending?.type === 'create'
      ? create.error
      : pending?.type === 'delete'
        ? remove.error
        : update.error;

  const dialogs: FolderActionDialogsState = {
    pending,
    isPending: create.isPending || update.isPending || remove.isPending,
    error:
      pending === null || failure === null
        ? null
        : fileError(
            failure,
            pending.type === 'create'
              ? 'Impossible de créer ce dossier.'
              : pending.type === 'delete'
                ? 'Impossible de supprimer ce dossier.'
                : 'Impossible de modifier ce dossier.',
          ),
    onClose: () => setPending(null),
    onSubmitName: (name) => {
      if (pending?.type === 'create')
        create.mutate(
          { name, ...(pending.parentId === null ? {} : { parentId: pending.parentId }) },
          { onSuccess: finish('Dossier créé.') },
        );
      else if (pending?.type === 'rename')
        update.mutate(
          { id: pending.folder.id, input: { name } },
          { onSuccess: finish('Dossier renommé.') },
        );
    },
    onMove: (parentId) => {
      if (pending?.type === 'move')
        update.mutate(
          { id: pending.folder.id, input: { parentId } },
          { onSuccess: finish('Dossier déplacé.') },
        );
    },
    onConfirmDelete: () => {
      if (pending?.type !== 'delete') return;
      const { folder } = pending;
      remove.mutate(folder.id, {
        onSuccess: () => {
          finish('Dossier supprimé.')();
          onDeleted?.(folder);
        },
      });
    },
  };

  return {
    dialogs,
    notice,
    create: (parentId: string | null) => open({ type: 'create', parentId }),
    rename: (folder: FileFolder) => open({ type: 'rename', folder }),
    move: (folder: FileFolder) => open({ type: 'move', folder }),
    remove: (folder: FileFolder) => open({ type: 'delete', folder }),
  };
}
