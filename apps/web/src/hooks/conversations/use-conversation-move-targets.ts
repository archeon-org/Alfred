import { useInfiniteQuery } from '@tanstack/react-query';

import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { projectKeys } from '@/hooks/workspace/workspace-keys';
import { describeApiError } from '@/lib/workspace/api-error-message';
import { listProjects, type Project, type ProjectPage } from '@/services/projects/projects.service';

export interface ConversationMoveTargets {
  readonly projects: readonly Project[];
  readonly isLoading: boolean;
  readonly isLoadingMore: boolean;
  readonly hasMore: boolean;
  readonly error: string | null;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
}

/** All active named projects, including pinned projects, in account-scoped pages. */
export function useConversationMoveTargets(enabled: boolean): ConversationMoveTargets {
  const { client, userId } = useWorkspaceAccount();
  const query = useInfiniteQuery({
    enabled,
    queryKey: [...projectKeys.all(userId), 'move-targets'],
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: ProjectPage) => page.nextCursor ?? undefined,
    queryFn: ({ pageParam }) => listProjects(client, { cursor: pageParam, limit: 10 }),
  });
  return {
    projects: (query.data?.pages.flatMap((page) => page.items) ?? []).filter(
      (project) =>
        project.kind === 'named' && project.status === 'active' && project.archivedAt === null,
    ),
    isLoading: query.isPending,
    isLoadingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    error: query.isError
      ? describeApiError(query.error, 'Impossible de charger les projets.')
      : null,
    onLoadMore: () => {
      if (!query.isFetching) void query.fetchNextPage();
    },
    onRetry: () => {
      if (!query.isFetching)
        void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch());
    },
  };
}
