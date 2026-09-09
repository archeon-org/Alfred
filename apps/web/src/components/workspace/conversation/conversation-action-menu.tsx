import { FolderInput, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';

import { ActionMenu } from '@/components/ui/action-menu';
import type { Conversation } from '@/lib/workspace/workspace.types';

export interface ConversationActionHandlers {
  readonly onMove: (conversation: Conversation) => void;
  readonly onRename: (conversation: Conversation) => void;
  readonly onTogglePin: (conversation: Conversation) => void;
  readonly onDelete: (conversation: Conversation) => void;
}

interface ConversationActionMenuProps extends ConversationActionHandlers {
  readonly conversation: Conversation;
  readonly className?: string;
}

export function ConversationActionMenu({
  conversation,
  onMove,
  onRename,
  onTogglePin,
  onDelete,
  className,
}: ConversationActionMenuProps) {
  const pinned = conversation.pinnedAt !== null;
  return (
    <ActionMenu
      className={className}
      label={`Actions de la conversation ${conversation.title}`}
      items={[
        ...(conversation.projectKind === 'implicit'
          ? [
              {
                id: 'move',
                icon: FolderInput,
                label: 'Ajouter à un projet',
                onSelect: () => onMove(conversation),
              },
            ]
          : []),
        {
          id: 'rename',
          icon: Pencil,
          label: 'Renommer la conversation',
          onSelect: () => onRename(conversation),
        },
        {
          id: 'pin',
          icon: pinned ? PinOff : Pin,
          label: pinned ? 'Désépingler la conversation' : 'Épingler la conversation',
          onSelect: () => onTogglePin(conversation),
        },
        {
          id: 'delete',
          icon: Trash2,
          label: 'Supprimer la conversation',
          destructive: true,
          separatorBefore: true,
          onSelect: () => onDelete(conversation),
        },
      ]}
    />
  );
}
