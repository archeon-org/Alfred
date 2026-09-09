import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { conversationKeys, projectKeys } from '@/hooks/workspace/workspace-keys';
import {
  createConversation,
  deleteConversation,
  type CreateConversationInput,
} from '@/services/conversations/conversations.service';

export function useCreateConversation() {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConversationInput) =>
      createConversation(client, input, crypto.randomUUID()),
    onSuccess: async (conversation) => {
      queryClient.setQueryData(conversationKeys.detail(userId, conversation.id), conversation);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: conversationKeys.list(userId, null) }),
        queryClient.invalidateQueries({
          queryKey: conversationKeys.list(userId, conversation.projectId),
        }),
        queryClient.invalidateQueries({ queryKey: projectKeys.list(userId) }),
      ]);
    },
  });
}

export function useDeleteConversation() {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteConversation(client, id),
    onSuccess: async (_result, id) => {
      queryClient.removeQueries({ queryKey: conversationKeys.detail(userId, id) });
      await queryClient.invalidateQueries({ queryKey: conversationKeys.all(userId) });
    },
  });
}
