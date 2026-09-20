import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { useChatSession } from '@/hooks/conversations/use-chat-session';
import { useCreateConversation } from '@/hooks/conversations/use-conversation-mutations';
import { useFeatureFlagsQuery } from '@/hooks/feature-flags/use-feature-flags-query';
import type { AttachmentView } from '@/lib/files/composer-attachments';

/** Router state handed to the chat screen when the message could not be sent right away. */
export function draftFrom(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null || !('draft' in state)) return undefined;
  return typeof state.draft === 'string' && state.draft.trim() !== '' ? state.draft : undefined;
}

/**
 * Composer-first creation: the first message creates the untitled chat (in `projectId` or in its
 * own implicit project), the workspace chat session starts streaming its answer, and the screen
 * moves to the chat. The API names the chat from that message and refines the title through the
 * runtime title agent. Without the agent bridge the message waits in the chat as a draft, and
 * its files as ids in the router state: the chat that receives them shows their chips again.
 */
export function useStartConversation(projectId?: string) {
  const create = useCreateConversation();
  const navigate = useNavigate();
  const session = useChatSession();
  const { flags, status } = useFeatureFlagsQuery();
  const bridgeAvailable = status === 'ready' && flags.agentRuntime;
  const { mutateAsync, reset } = create;

  /** Resolves true once the chat exists and holds the message; false keeps it in the composer. */
  const start = useCallback(
    async (text: string, attachments: readonly AttachmentView[] = []): Promise<boolean> => {
      const draft = text.trim();
      // A first message may be its files alone.
      if (draft === '' && attachments.length === 0) return false;
      try {
        const conversation = await mutateAsync(projectId === undefined ? {} : { projectId });
        const sent = bridgeAvailable && session.send(conversation.id, draft, attachments);
        void navigate(
          `/app/conversations/${conversation.id}`,
          sent
            ? undefined
            : { state: { draft, attachmentIds: attachments.map(({ fileId }) => fileId) } },
        );
        return true;
      } catch {
        // The mutation error feeds the screen notice; the composer keeps the draft.
        return false;
      }
    },
    [bridgeAvailable, mutateAsync, navigate, projectId, session],
  );

  return {
    error: create.isError ? create.error : null,
    isPending: create.isPending,
    reset,
    start,
  };
}
