import { useQuery } from '@tanstack/react-query';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { listAgents } from '@/services/agents/agents.service';

export function useAgentCatalog() {
  const { client, userId } = useWorkspaceAccount();
  const query = useQuery({
    queryKey: ['agents', userId],
    queryFn: () => listAgents(client),
    staleTime: 60_000,
  });
  return { query, agents: query.data?.items ?? [] };
}
