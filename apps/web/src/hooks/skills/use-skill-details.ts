import { useQuery } from '@tanstack/react-query';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { getSkill } from '@/services/skills/skills.service';

export function useSkillDetails(id?: string) {
  const { client, userId } = useWorkspaceAccount();
  return useQuery({
    queryKey: ['skills', userId, 'detail', id],
    enabled: id !== undefined,
    queryFn: () => getSkill(client, id ?? ''),
  });
}
