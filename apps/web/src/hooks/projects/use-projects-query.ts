import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { projectKeys } from '@/hooks/workspace/workspace-keys';
import {
  getProject,
  listProjects,
  type Project,
  type ProjectPage,
} from '@/services/projects/projects.service';

export type QueryStatus = 'error' | 'loading' | 'ready';

/** The navigation shows a handful of recent projects first, then larger pages on demand. */
export const RECENT_PROJECTS_FIRST_PAGE = 3;
const RECENT_PROJECTS_NEXT_PAGE = 10;

/** Unpinned named projects, most recently updated first, loaded page by page. */
export function useProjectsQuery() {
  const { client, userId } = useWorkspaceAccount();
  const query = useInfiniteQuery({
    getNextPageParam: (lastPage: ProjectPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }): Promise<ProjectPage> =>
      listProjects(client, {
        cursor: pageParam,
        limit: pageParam === undefined ? RECENT_PROJECTS_FIRST_PAGE : RECENT_PROJECTS_NEXT_PAGE,
        pinned: false,
      }),
    queryKey: projectKeys.list(userId, 'recent'),
  });
  const status: QueryStatus = query.isPending ? 'loading' : query.isError ? 'error' : 'ready';
  return {
    error: query.isError ? query.error : null,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    projects: (query.data?.pages.flatMap((page) => page.items) ?? []) as readonly Project[],
    reload: () => void query.refetch(),
    status,
  };
}

/** Pinned projects in the order they were pinned. */
export function usePinnedProjectsQuery() {
  const { client, userId } = useWorkspaceAccount();
  const { data, error, isError, isPending, refetch } = useQuery({
    queryFn: () => listProjects(client, { pinned: true }),
    queryKey: projectKeys.list(userId, 'pinned'),
  });
  const status: QueryStatus = isPending ? 'loading' : isError ? 'error' : 'ready';
  return {
    error: isError ? error : null,
    projects: data?.items ?? ([] as readonly Project[]),
    reload: () => void refetch(),
    status,
  };
}

export function useProjectQuery(projectId: string | undefined) {
  const { client, userId } = useWorkspaceAccount();
  const { data, error, isError, isPending, refetch } = useQuery({
    enabled: projectId !== undefined,
    queryFn: () => getProject(client, projectId ?? ''),
    queryKey: projectKeys.detail(userId, projectId ?? ''),
  });
  const status: QueryStatus =
    projectId === undefined ? 'ready' : isPending ? 'loading' : isError ? 'error' : 'ready';
  return { error: isError ? error : null, project: data, reload: () => void refetch(), status };
}
