import { useInfiniteQuery } from '@tanstack/react-query';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { listSkillVersions } from '@/services/skills/skills.service';

export function useSkillVersions(id: string, enabled: boolean) {
  const { client, userId } = useWorkspaceAccount();
  return useInfiniteQuery({
    queryKey: ['skills', userId, 'versions', id],
    enabled,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => listSkillVersions(client, id, pageParam),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
}
