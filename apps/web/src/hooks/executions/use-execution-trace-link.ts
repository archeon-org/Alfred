import { useMutation } from '@tanstack/react-query';

import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { getExecutionTraceLink } from '@/services/executions/executions.service';

/** Resolves the trace console address of one execution on demand; the API decides availability. */
export function useExecutionTraceLink() {
  const { client } = useWorkspaceAccount();
  return useMutation({
    mutationFn: (executionId: string) => getExecutionTraceLink(client, executionId),
  });
}
