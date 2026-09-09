import { useCallback, useMemo } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import type { QueryStatus } from '@/hooks/projects/use-projects-query';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { conversationKeys } from '@/hooks/workspace/workspace-keys';
import {
  getConversation,
  listConversations,
  type Conversation,
  type ConversationPage,
} from '@/services/conversations/conversations.service';

const PAGE_SIZE = 10;

/** Chats of one project, or standalone chats when `projectId` is null. Cursor pages accumulate. */
export function useConversationsQuery(projectId: string | null, enabled = true) {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => conversationKeys.list(userId, projectId), [userId, projectId]);
  const query = useInfiniteQuery({
    enabled,
    retry: false,
    getNextPageParam: (lastPage: ConversationPage, _pages, _param, pageParams) =>
      lastPage.nextCursor === null || pageParams.includes(lastPage.nextCursor)
        ? undefined
        : lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }): Promise<ConversationPage> =>
      listConversations(client, {
        cursor: pageParam,
        limit: PAGE_SIZE,
        ...(projectId === null ? { projectKind: 'implicit' as const } : { projectId }),
      }),
    queryKey,
  });
  const { hasNextPage, isError, fetchNextPage, isFetchNextPageError, refetch } = query;
  const fetchMore = useCallback(
    (retry = false) => {
      if (
        !enabled ||
        !hasNextPage ||
        queryClient.isFetching({ queryKey, exact: true }) > 0 ||
        (isError && !retry)
      )
        return;
      void fetchNextPage({ cancelRefetch: false });
    },
    [enabled, hasNextPage, isError, fetchNextPage, queryClient, queryKey],
  );
  const loadMore = useCallback(() => fetchMore(), [fetchMore]);
  const retryMore = useCallback(() => {
    if (isFetchNextPageError) fetchMore(true);
    else if (queryClient.isFetching({ queryKey, exact: true }) === 0) void refetch();
  }, [fetchMore, isFetchNextPageError, queryClient, queryKey, refetch]);
  const conversations = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [item.id, item]),
    ).values(),
  ];
  const status: QueryStatus = query.isPending
    ? 'loading'
    : query.isError && query.data === undefined
      ? 'error'
      : 'ready';
  return {
    conversations: conversations as readonly Conversation[],
    error: query.isError ? query.error : null,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore,
    retryMore,
    reload: () => void query.refetch(),
    status,
  };
}

export function useConversationQuery(conversationId: string | undefined) {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  const { data, error, isError, isPending, refetch } = useQuery({
    enabled: conversationId !== undefined,
    initialData: () =>
      queryClient
        .getQueriesData<InfiniteData<ConversationPage>>({
          queryKey: conversationKeys.lists(userId),
        })
        .flatMap(([, data]) => data?.pages.flatMap((page) => page.items) ?? [])
        .find((conversation) => conversation.id === conversationId),
    initialDataUpdatedAt: 0,
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
