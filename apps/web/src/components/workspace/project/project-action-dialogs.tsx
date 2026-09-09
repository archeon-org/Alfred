import { PROJECT_NAME_MAX_LENGTH } from '@alfred/contracts';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextFieldDialog } from '@/components/ui/text-field-dialog';
import type { ProjectActionDialogsState } from '@/hooks/projects/use-project-actions';

/** The rename and delete dialogs shared by every place that offers project actions. */
export function ProjectActionDialogs({
  error,
  isPending,
  onClose,
  onConfirmDelete,
  onRename,
  pending,
}: ProjectActionDialogsState) {
  const name = pending?.project.name ?? 'Projet';
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  return (
    <>
      <TextFieldDialog
        error={pending?.type === 'rename' ? error : null}
        initialValue={pending?.project.name ?? ''}
        isPending={isPending}
        label="Nom du projet"
        maxLength={PROJECT_NAME_MAX_LENGTH}
        onOpenChange={handleOpenChange}
        onSubmit={onRename}
        open={pending?.type === 'rename'}
        submitLabel="Renommer"
        title="Renommer le projet"
      />
      <ConfirmDialog
        confirmLabel="Supprimer le projet"
        description={`Le projet « ${name} » et tous ses chats seront supprimés définitivement. Cette action est irréversible.`}
        destructive
        error={pending?.type === 'delete' ? error : null}
        isPending={isPending}
        onConfirm={onConfirmDelete}
        onOpenChange={handleOpenChange}
        open={pending?.type === 'delete'}
        title="Supprimer ce projet ?"
      />
    </>
  );
}
