import type { Conversation } from '@alfred/contracts';
import type { QueryClient } from '@tanstack/react-query';

import { conversationKeys } from '@/hooks/workspace/workspace-keys';

/**
 * Keeps the conversation cache in step with the product state a stream carries: the detail is
 * replaced unless the cache is newer, and list ordering is refreshed only when a listed field
 * changed, so streamed frames never turn into navigation requests.
 */
export function createConversationCache(queryClient: QueryClient, userId: string) {
  let previous: Conversation | null = null;
  return (conversation: Conversation): void => {
    if (JSON.stringify(previous) === JSON.stringify(conversation)) return;
    const before = previous;
    previous = conversation;
    const cached = queryClient.getQueryData<Conversation>(
      conversationKeys.detail(userId, conversation.id),
    );
    if (cached && cached.updatedAt > conversation.updatedAt) return;
    queryClient.setQueryData(conversationKeys.detail(userId, conversation.id), conversation);
    // Activity timestamps advance with token projection. Refresh list ordering on attachment and
    // completion, but do not turn every streamed frame into another navigation HTTP request.
    if (
      before === null ||
      before.title !== conversation.title ||
      before.titleSource !== conversation.titleSource ||
      before.projectId !== conversation.projectId ||
      before.projectKind !== conversation.projectKind ||
      before.pinnedAt !== conversation.pinnedAt ||
      before.archivedAt !== conversation.archivedAt
    )
      void queryClient.invalidateQueries({ queryKey: conversationKeys.lists(userId) });
  };
}
