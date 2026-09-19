import { FILE_NAME_MAX_LENGTH, type FileFolder } from '@alfred/contracts';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextFieldDialog } from '@/components/ui/text-field-dialog';
import { FileDetailsDialog } from '@/components/workspace/files/file-details-dialog';
import { FolderPickerDialog } from '@/components/workspace/files/folder-picker-dialog';
import type { FileActionDialogsState } from '@/hooks/files/use-file-actions';
import { describeBulkDeletion, describeFileDeletion } from '@/lib/files/file-format';

interface FileActionDialogsProps extends FileActionDialogsState {
  /** The folder tree, for the move dialog. */
  readonly folders: readonly FileFolder[];
}

/** Rename, move, describe and delete dialogs, shared by the « Fichiers » tab and the explorer. */
export function FileActionDialogs({
  error,
  folders,
  isPending,
  onClose,
  onConfirmDelete,
  onMove,
  onRename,
  onSaveDetails,
  pending,
}: FileActionDialogsProps) {
  const files = pending?.files ?? [];
  const first = files[0];
  const many = files.length > 1;
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  // A selection spread over several folders has no single "current" location.
  const sameFolder = files.every((file) => file.folderId === first?.folderId);
  return (
    <>
      <TextFieldDialog
        error={pending?.type === 'rename' ? error : null}
        initialValue={pending?.type === 'rename' ? (first?.name ?? '') : ''}
        isPending={isPending}
        label="Nom du fichier"
        maxLength={FILE_NAME_MAX_LENGTH}
        onOpenChange={handleOpenChange}
        onSubmit={onRename}
        open={pending?.type === 'rename'}
        submitLabel="Renommer"
        title="Renommer le fichier"
      />
      <FolderPickerDialog
        currentId={sameFolder ? first?.folderId : undefined}
        description={
          many
            ? `${files.length} fichiers changent de dossier. Rien ne change dans les conversations.`
            : `« ${first?.name ?? ''} » change de dossier. Rien ne change dans les conversations.`
        }
        error={pending?.type === 'move' ? error : null}
        folders={folders}
        isPending={isPending}
        onClose={onClose}
        onSubmit={onMove}
        open={pending?.type === 'move'}
        title={many ? 'Déplacer les fichiers' : 'Déplacer le fichier'}
      />
      <FileDetailsDialog
        error={pending?.type === 'details' ? error : null}
        file={pending?.type === 'details' ? (first ?? null) : null}
        isPending={isPending}
        onClose={onClose}
        onSubmit={onSaveDetails}
        open={pending?.type === 'details'}
      />
      <ConfirmDialog
        confirmLabel={many ? `Supprimer ${files.length} fichiers` : 'Supprimer le fichier'}
        description={
          first === undefined
            ? ''
            : many
              ? describeBulkDeletion(files)
              : describeFileDeletion(first)
        }
        destructive
        error={pending?.type === 'delete' ? error : null}
        isPending={isPending}
        onConfirm={onConfirmDelete}
        onOpenChange={handleOpenChange}
        open={pending?.type === 'delete'}
        title={many ? 'Supprimer ces fichiers ?' : 'Supprimer ce fichier ?'}
      />
    </>
  );
}
