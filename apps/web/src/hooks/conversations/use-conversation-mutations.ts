import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { conversationKeys, projectKeys } from '@/hooks/workspace/workspace-keys';
import {
  createConversation,
  moveConversation,
  deleteConversation,
  updateConversation,
  setConversationPinned,
  type Conversation,
  type UpdateConversationInput,
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
      await queryClient.invalidateQueries({ queryKey: conversationKeys.lists(userId) });
    },
  });
}

function useConversationChanged() {
  const { userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  return async (conversation: Conversation) => {
    await queryClient.cancelQueries({ queryKey: conversationKeys.detail(userId, conversation.id) });
    queryClient.setQueryData(conversationKeys.detail(userId, conversation.id), conversation);
    await queryClient.invalidateQueries({ queryKey: conversationKeys.lists(userId) });
  };
}

export function useUpdateConversation() {
  const { client } = useWorkspaceAccount();
  const onSuccess = useConversationChanged();
  return useMutation({
    mutationFn: ({ id, input }: { readonly id: string; readonly input: UpdateConversationInput }) =>
      updateConversation(client, id, input),
    onSuccess,
  });
}

export function useSetConversationPinned() {
  const { client } = useWorkspaceAccount();
  const onSuccess = useConversationChanged();
  return useMutation({
    mutationFn: ({ id, pinned }: { readonly id: string; readonly pinned: boolean }) =>
      setConversationPinned(client, id, pinned),
    onSuccess,
  });
}

export function useMoveConversation() {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  const onChanged = useConversationChanged();
  return useMutation({
    mutationFn: ({
      conversation,
      projectId,
      key,
    }: {
      readonly conversation: Conversation;
      readonly projectId: string;
      readonly key: string;
    }) => moveConversation(client, conversation.id, { projectId }, key),
    onSuccess: async (conversation, input) => {
      queryClient.removeQueries({
        queryKey: projectKeys.detail(userId, input.conversation.projectId),
      });
      await Promise.all([
        onChanged(conversation),
        queryClient.invalidateQueries({ queryKey: projectKeys.all(userId) }),
      ]);
    },
  });
}
