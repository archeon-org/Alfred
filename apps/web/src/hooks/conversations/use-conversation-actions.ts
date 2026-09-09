import { useState } from 'react';

import {
  useDeleteConversation,
  useSetConversationPinned,
  useUpdateConversation,
} from '@/hooks/conversations/use-conversation-mutations';
import { describeApiError } from '@/lib/workspace/api-error-message';
import type { Conversation } from '@/lib/workspace/workspace.types';

export interface PendingConversationAction {
  readonly type: 'delete' | 'rename';
  readonly conversation: Conversation;
}

/** State handed to `ConversationActionDialogs`; the dialogs themselves stay presentational. */
export interface ConversationActionDialogsState {
  readonly pending: PendingConversationAction | null;
  readonly isPending: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onRename: (title: string) => void;
  readonly onConfirmDelete: () => void;
}

interface UseConversationActionsOptions {
  /** Called after a successful deletion, for example to leave the deleted conversation's pages. */
  readonly onDeleted?: (conversation: Conversation) => void;
}

/** Rename, pin/unpin and delete a conversation from anywhere (sidebar menu, conversation page). */
export function useConversationActions({ onDeleted }: UseConversationActionsOptions = {}) {
  const update = useUpdateConversation();
  const remove = useDeleteConversation();
  const setPinned = useSetConversationPinned();
  const [pending, setPending] = useState<PendingConversationAction | null>(null);

  const close = () => {
    setPending(null);
    update.reset();
    remove.reset();
  };

  const dialogs: ConversationActionDialogsState = {
    error:
      pending?.type === 'rename' && update.isError
        ? describeApiError(update.error, 'Impossible de renommer la conversation.')
        : pending?.type === 'delete' && remove.isError
          ? describeApiError(remove.error, 'Impossible de supprimer la conversation.')
          : null,
    isPending: update.isPending || remove.isPending,
    onClose: close,
    onConfirmDelete: () => {
      if (pending?.type !== 'delete') return;
      const { conversation } = pending;
      remove.mutate(conversation.id, {
        onSuccess: () => {
          close();
          onDeleted?.(conversation);
        },
      });
    },
    onRename: (title) => {
      if (pending?.type !== 'rename') return;
      update.mutate({ id: pending.conversation.id, input: { title } }, { onSuccess: close });
    },
    pending,
  };

  return {
    dialogs,
    pinError: setPinned.isError
      ? describeApiError(setPinned.error, 'Impossible de modifier l’épinglage de la conversation.')
      : null,
    remove: (conversation: Conversation) => setPending({ conversation, type: 'delete' }),
    rename: (conversation: Conversation) => setPending({ conversation, type: 'rename' }),
    togglePin: (conversation: Conversation) =>
      setPinned.mutate({ id: conversation.id, pinned: conversation.pinnedAt === null }),
  };
}
