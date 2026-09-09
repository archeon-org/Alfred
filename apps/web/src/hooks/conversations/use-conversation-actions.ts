import {
  useConversationMoveTargets,
  type ConversationMoveTargets,
} from '@/hooks/conversations/use-conversation-move-targets';
import { useRef, useState } from 'react';

import {
  useDeleteConversation,
  useMoveConversation,
  useSetConversationPinned,
  useUpdateConversation,
} from '@/hooks/conversations/use-conversation-mutations';
import { describeApiError } from '@/lib/workspace/api-error-message';
import type { Conversation } from '@/lib/workspace/workspace.types';

export interface PendingConversationAction {
  readonly type: 'delete' | 'rename' | 'move';
  readonly conversation: Conversation;
}

/** State handed to `ConversationActionDialogs`; the dialogs themselves stay presentational. */
export interface ConversationActionDialogsState {
  readonly pending: PendingConversationAction | null;
  readonly isPending: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onRename: (title: string) => void;
  readonly moveTargets: ConversationMoveTargets;
  readonly onMove: (projectId: string) => void;
  readonly onConfirmDelete: () => void;
}

interface UseConversationActionsOptions {
  /** Called after a successful deletion, for example to leave the deleted conversation's pages. */
  readonly onDeleted?: (conversation: Conversation) => void;
}

/** Rename, pin/unpin and delete a conversation from anywhere (sidebar menu, conversation page). */
export function useConversationActions({ onDeleted }: UseConversationActionsOptions = {}) {
  const move = useMoveConversation();
  const moveKey = useRef<{ projectId: string; key: string } | null>(null);
  const update = useUpdateConversation();
  const remove = useDeleteConversation();
  const setPinned = useSetConversationPinned();
  const [pending, setPending] = useState<PendingConversationAction | null>(null);

  const moveTargets = useConversationMoveTargets(pending?.type === 'move');

  const close = () => {
    setPending(null);
    update.reset();
    remove.reset();
    move.reset();
    moveKey.current = null;
  };

  const dialogs: ConversationActionDialogsState = {
    moveTargets,
    onMove: (projectId) => {
      if (pending?.type !== 'move' || move.isPending) return;
      if (moveKey.current?.projectId !== projectId)
        moveKey.current = { projectId, key: crypto.randomUUID() };
      move.mutate(
        { conversation: pending.conversation, projectId, key: moveKey.current.key },
        { onSuccess: close },
      );
    },
    error:
      pending?.type === 'move' && move.isError
        ? describeApiError(move.error, 'Impossible de déplacer la conversation.')
        : pending?.type === 'rename' && update.isError
          ? describeApiError(update.error, 'Impossible de renommer la conversation.')
          : pending?.type === 'delete' && remove.isError
            ? describeApiError(remove.error, 'Impossible de supprimer la conversation.')
            : null,
    isPending: update.isPending || remove.isPending || move.isPending,
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
    move: (conversation: Conversation) => {
      moveKey.current = null;
      move.reset();
      setPending({ conversation, type: 'move' });
    },
    pinError: setPinned.isError
      ? describeApiError(setPinned.error, 'Impossible de modifier l’épinglage de la conversation.')
      : null,
    remove: (conversation: Conversation) => setPending({ conversation, type: 'delete' }),
    rename: (conversation: Conversation) => setPending({ conversation, type: 'rename' }),
    togglePin: (conversation: Conversation) =>
      setPinned.mutate({ id: conversation.id, pinned: conversation.pinnedAt === null }),
  };
}
