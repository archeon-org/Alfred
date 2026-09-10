import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SkillWriteInput } from '@alfred/contracts';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import * as api from '@/services/skills/skills.service';

export function useSkillMutations() {
  const { client, userId } = useWorkspaceAccount();
  const cache = useQueryClient();
  const queryKey = ['skills', userId];
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey });
  };
  const save = useMutation({
    mutationFn: ({
      input,
      current,
    }: {
      input: SkillWriteInput;
      current?: { id: string; version: number };
    }) => api.saveSkill(client, input, current),
    onSuccess: refresh,
  });
  const publish = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.publishSkill(client, id, version),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.deleteSkill(client, id, version),
    onSuccess: refresh,
  });
  const restore = useMutation({
    mutationFn: ({
      id,
      version,
      sourceVersion,
    }: {
      id: string;
      version: number;
      sourceVersion: number;
    }) => api.restoreSkill(client, id, version, sourceVersion),
    onSuccess: refresh,
  });
  const availability = useMutation({
    mutationFn: ({ id, version, enabled }: { id: string; version: number; enabled: boolean }) =>
      api.setSkillAvailability(client, id, version, enabled),
    onSuccess: refresh,
  });
  return {
    restore: restore.mutateAsync,
    availability: availability.mutateAsync,
    save: save.mutateAsync,
    publish: publish.mutateAsync,
    remove: remove.mutateAsync,
  };
}
export function useSkills(search?: string) {
  const { client, userId } = useWorkspaceAccount();
  const mutations = useSkillMutations();
  const queryKey = ['skills', userId];
  const query = useInfiniteQuery({
    queryKey: [...queryKey, search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.listSkills(client, pageParam, search),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  return {
    query,
    skills: query.data?.pages.flatMap((page) => page.items) ?? [],
    get: (id: string) => api.getSkill(client, id),
    ...mutations,
  };
}
