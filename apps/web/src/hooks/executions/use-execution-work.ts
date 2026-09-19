import { useQuery } from '@tanstack/react-query';

import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { executionKeys } from '@/hooks/workspace/workspace-keys';
import { getExecution } from '@/services/executions/executions.service';

/**
 * The work log of a stored answer, read on demand from its execution. A settled execution never
 * changes, so the result stays fresh for the session; an older API without the log yields none.
 */
export function useExecutionWork(executionId: string, enabled: boolean) {
  const { client, userId } = useWorkspaceAccount();
  return useQuery({
    queryFn: async ({ signal }) => {
      const snapshot = await getExecution(client, executionId, signal);
      return snapshot.work ?? null;
    },
    queryKey: executionKeys.work(userId, executionId),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
