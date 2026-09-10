import type { CurrentWorkspaces } from '@alfred/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceAccount } from './use-workspace-account';
import { workspaceKeys } from './workspace-keys';
import { ApiRequestError } from '@/services/http/api-json';
import { getCurrentWorkspaces } from '@/services/workspaces/workspaces.service';

export function useCurrentWorkspaces() {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  const queryKey = workspaceKeys.membership(userId);
  const query = useQuery<CurrentWorkspaces | null>({
    queryKey,
    queryFn: async () => {
      try {
        return await getCurrentWorkspaces(client);
      } catch (error) {
        // Null clears rejected names; undefined would leave the previous cache intact.
        if (!isTransientError(error)) queryClient.setQueryData(queryKey, null);
        throw error;
      }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return {
    membership: query.data ?? undefined,
    isError: query.isError,
  };
}

function isTransientError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof ApiRequestError && error.status >= 500);
}
