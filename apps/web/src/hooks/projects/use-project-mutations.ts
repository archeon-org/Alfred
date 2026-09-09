import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { conversationKeys, projectKeys } from '@/hooks/workspace/workspace-keys';
import {
  createProject,
  deleteProject,
  setProjectPinned,
  updateProject,
  type CreateProjectInput,
  type Project,
  type UpdateProjectInput,
} from '@/services/projects/projects.service';

/** One idempotency key per user gesture; React Query retries replay the same request. */
function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function useCreateProject() {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(client, input, newIdempotencyKey()),
    onSuccess: async (project) => {
      queryClient.setQueryData(projectKeys.detail(userId, project.id), project);
      await queryClient.invalidateQueries({ queryKey: projectKeys.list(userId, 'recent') });
    },
  });
}

export function useUpdateProject() {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { readonly id: string; readonly input: UpdateProjectInput }) =>
      updateProject(client, id, input),
    onSuccess: async (project: Project) => {
      queryClient.setQueryData(projectKeys.detail(userId, project.id), project);
      await queryClient.invalidateQueries({ queryKey: projectKeys.all(userId) });
    },
  });
}

/** Pinning moves a project between the pinned and recent lists; both are refreshed. */
export function useSetProjectPinned() {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }: { readonly id: string; readonly pinned: boolean }) =>
      setProjectPinned(client, id, pinned),
    onSuccess: async (project: Project) => {
      queryClient.setQueryData(projectKeys.detail(userId, project.id), project);
      await queryClient.invalidateQueries({ queryKey: projectKeys.all(userId) });
    },
  });
}

export function useDeleteProject() {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(client, id),
    onSuccess: async (_result, id) => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(userId, id) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectKeys.all(userId) }),
        queryClient.invalidateQueries({ queryKey: conversationKeys.all(userId) }),
      ]);
    },
  });
}
