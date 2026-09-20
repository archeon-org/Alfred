import { FOLDER_NAME_MAX_LENGTH, type FileFolder } from '@alfred/contracts';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextFieldDialog } from '@/components/ui/text-field-dialog';
import { FolderPickerDialog } from '@/components/workspace/files/folder-picker-dialog';
import type { FolderActionDialogsState } from '@/hooks/files/use-folder-actions';
import { folderSubtree } from '@/lib/files/folder-tree';

interface FolderActionDialogsProps extends FolderActionDialogsState {
  readonly folders: readonly FileFolder[];
}

/** Create, rename, move and delete a folder of the library. */
export function FolderActionDialogs({
  error,
  folders,
  isPending,
  onClose,
  onConfirmDelete,
  onMove,
  onSubmitName,
  pending,
}: FolderActionDialogsProps) {
  const folder = pending !== null && pending.type !== 'create' ? pending.folder : null;
  const naming = pending?.type === 'create' || pending?.type === 'rename';
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  return (
    <>
      <TextFieldDialog
        description={
          pending?.type === 'create'
            ? 'Un dossier range vos fichiers ; il ne change rien à ce qu’Alfred peut lire.'
            : undefined
        }
        error={naming ? error : null}
        initialValue={pending?.type === 'rename' ? pending.folder.name : ''}
        isPending={isPending}
        label="Nom du dossier"
        maxLength={FOLDER_NAME_MAX_LENGTH}
        onOpenChange={handleOpenChange}
        onSubmit={onSubmitName}
        open={naming}
        placeholder="Ex. Contrats 2026"
        submitLabel={pending?.type === 'rename' ? 'Renommer' : 'Créer le dossier'}
        title={pending?.type === 'rename' ? 'Renommer le dossier' : 'Nouveau dossier'}
      />
      <FolderPickerDialog
        currentId={folder?.parentId}
        description={`« ${folder?.name ?? ''} » et tout ce qu’il contient changent d’emplacement.`}
        error={pending?.type === 'move' ? error : null}
        {...(folder === null ? {} : { excludedIds: folderSubtree(folders, folder.id) })}
        folders={folders}
        isPending={isPending}
        onClose={onClose}
        onSubmit={onMove}
        open={pending?.type === 'move'}
        title="Déplacer le dossier"
      />
      <ConfirmDialog
        confirmLabel="Supprimer le dossier"
        description={`Le dossier « ${folder?.name ?? ''} » sera supprimé. Un dossier qui contient encore des fichiers ou des dossiers ne peut pas l’être.`}
        destructive
        error={pending?.type === 'delete' ? error : null}
        isPending={isPending}
        onConfirm={onConfirmDelete}
        onOpenChange={handleOpenChange}
        open={pending?.type === 'delete'}
        title="Supprimer ce dossier ?"
      />
    </>
  );
}
