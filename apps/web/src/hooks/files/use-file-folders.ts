import type { CreateFolderInput, UpdateFolderInput } from '@alfred/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { refreshFileLibrary } from '@/hooks/files/file-cache';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { fileKeys } from '@/hooks/workspace/workspace-keys';
import {
  createFolder,
  deleteFolder,
  listFolders,
  updateFolder,
} from '@/services/files/files.service';

/** The whole folder tree of the library. Folders are metadata: no storage path is ever shown. */
export function useFileFolders(enabled = true) {
  const { client, userId } = useWorkspaceAccount();
  const query = useQuery({
    queryKey: fileKeys.folders(userId),
    queryFn: ({ signal }) => listFolders(client, signal),
    enabled,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return { folders: query.data ?? [], query };
}

export function useFolderMutations() {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  const onSuccess = () => refreshFileLibrary(queryClient, userId);
  const create = useMutation({
    mutationFn: (input: CreateFolderInput) => createFolder(client, input),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { readonly id: string; readonly input: UpdateFolderInput }) =>
      updateFolder(client, id, input),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFolder(client, id),
    onSuccess,
  });
  return { create, remove, update };
}
