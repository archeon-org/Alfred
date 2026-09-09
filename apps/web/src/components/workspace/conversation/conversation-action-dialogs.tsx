import { CONVERSATION_TITLE_MAX_LENGTH } from '@alfred/contracts';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextFieldDialog } from '@/components/ui/text-field-dialog';
import type { ConversationActionDialogsState } from '@/hooks/conversations/use-conversation-actions';

/** The rename and delete dialogs shared by every place that offers conversation actions. */
export function ConversationActionDialogs({
  error,
  isPending,
  onClose,
  onConfirmDelete,
  onRename,
  pending,
}: ConversationActionDialogsState) {
  const name = pending?.conversation.title ?? 'Conversation';
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  return (
    <>
      <TextFieldDialog
        error={pending?.type === 'rename' ? error : null}
        initialValue={pending?.conversation.title ?? ''}
        isPending={isPending}
        label="Titre de la conversation"
        maxLength={CONVERSATION_TITLE_MAX_LENGTH}
        onOpenChange={handleOpenChange}
        onSubmit={onRename}
        open={pending?.type === 'rename'}
        submitLabel="Renommer"
        title="Renommer la conversation"
      />
      <ConfirmDialog
        confirmLabel="Supprimer la conversation"
        description={`La conversation « ${name} » sera supprimée définitivement. Cette action est irréversible.`}
        destructive
        error={pending?.type === 'delete' ? error : null}
        isPending={isPending}
        onConfirm={onConfirmDelete}
        onOpenChange={handleOpenChange}
        open={pending?.type === 'delete'}
        title="Supprimer cette conversation ?"
      />
    </>
  );
}
