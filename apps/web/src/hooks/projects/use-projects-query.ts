import { useQuery } from '@tanstack/react-query';

import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { projectKeys } from '@/hooks/workspace/workspace-keys';
import { getProject, listProjects, type Project } from '@/services/projects/projects.service';

export type QueryStatus = 'error' | 'loading' | 'ready';

/** First page of the caller's named projects, most recently updated first. */
export function useProjectsQuery() {
  const { client, userId } = useWorkspaceAccount();
  const { data, error, isError, isPending, refetch } = useQuery({
    queryFn: () => listProjects(client, { limit: 100 }),
    queryKey: projectKeys.list(userId),
  });
  const status: QueryStatus = isPending ? 'loading' : isError ? 'error' : 'ready';
  return {
    error: isError ? error : null,
    hasMore: data?.nextCursor !== null && data?.nextCursor !== undefined,
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
