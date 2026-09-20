import { useQuery } from '@tanstack/react-query';

import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { fileKeys } from '@/hooks/workspace/workspace-keys';
import { getFileQuota } from '@/services/files/files.service';

/** The byte budget of the library; every upload and deletion refreshes it. */
export function useFileQuota(enabled = true) {
  const { client, userId } = useWorkspaceAccount();
  return useQuery({
    queryKey: fileKeys.quota(userId),
    queryFn: ({ signal }) => getFileQuota(client, signal),
    enabled,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
