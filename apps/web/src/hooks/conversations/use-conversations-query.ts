import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { QueryStatus } from '@/hooks/projects/use-projects-query';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { conversationKeys } from '@/hooks/workspace/workspace-keys';
import {
  getConversation,
  listConversations,
  type Conversation,
  type ConversationPage,
} from '@/services/conversations/conversations.service';

const PAGE_SIZE = 50;

/** Chats of one project, or every recent chat when `projectId` is null. Cursor pages accumulate. */
export function useConversationsQuery(projectId: string | null) {
  const { client, userId } = useWorkspaceAccount();
  const query = useInfiniteQuery({
    getNextPageParam: (lastPage: ConversationPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }): Promise<ConversationPage> =>
      listConversations(client, {
        cursor: pageParam,
        limit: PAGE_SIZE,
        ...(projectId === null ? {} : { projectId }),
      }),
    queryKey: conversationKeys.list(userId, projectId),
  });
  const status: QueryStatus = query.isPending ? 'loading' : query.isError ? 'error' : 'ready';
  return {
    conversations: (query.data?.pages.flatMap((page) => page.items) ??
      []) as readonly Conversation[],
    error: query.isError ? query.error : null,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    reload: () => void query.refetch(),
    status,
  };
}

export function useConversationQuery(conversationId: string | undefined) {
  const { client, userId } = useWorkspaceAccount();
  const { data, error, isError, isPending, refetch } = useQuery({
    enabled: conversationId !== undefined,
    queryFn: () => getConversation(client, conversationId ?? ''),
    queryKey: conversationKeys.detail(userId, conversationId ?? ''),
  });
  const status: QueryStatus =
    conversationId === undefined ? 'ready' : isPending ? 'loading' : isError ? 'error' : 'ready';
  return {
    conversation: data,
    error: isError ? error : null,
    reload: () => void refetch(),
    status,
  };
}
