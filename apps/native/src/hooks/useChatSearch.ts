import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  sendChatMessage,
  excludeDocument,
  ChatMessage,
  ChatContext,
  ChatResponse,
} from "../services/search";

export interface UseChatSearchReturn {
  messages: ChatMessage[];
  context: ChatContext | null;
  isLoading: boolean;
  error: Error | null;
  sendMessage: (message: string) => Promise<void>;
  excludeDoc: (documentId: string) => Promise<void>;
  clearChat: () => void;
}

/**
 * Hook for chat-based document search
 *
 * @example
 * const { messages, sendMessage, isLoading } = useChatSearch();
 *
 * // Send a message
 * await sendMessage("I'm looking for my electricity bill from January");
 *
 * // Give feedback
 * await sendMessage("Not that one, something more recent");
 *
 * // Exclude a document from results
 * await excludeDoc(documentId);
 */
export function useChatSearch(): UseChatSearchReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [context, setContext] = useState<ChatContext | null>(null);

  const chatMutation = useMutation<
    ChatResponse,
    Error,
    { message: string; history: ChatMessage[]; ctx: ChatContext | undefined }
  >({
    mutationFn: ({ message, history, ctx }) =>
      sendChatMessage(message, history, ctx),
    onSuccess: (data, variables) => {
      // Add user message
      const userMessage: ChatMessage = {
        role: "user",
        content: variables.message,
        timestamp: new Date().toISOString(),
      };

      // Update messages and context
      setMessages((prev) => [...prev, userMessage, data.response]);
      setContext(data.context);
    },
  });

  const excludeMutation = useMutation<
    { context: ChatContext },
    Error,
    { documentId: string; ctx: ChatContext }
  >({
    mutationFn: ({ documentId, ctx }) => excludeDocument(documentId, ctx),
    onSuccess: (data) => {
      setContext(data.context);
    },
  });

  const sendMessage = useCallback(
    async (message: string) => {
      await chatMutation.mutateAsync({
        message,
        history: messages,
        ctx: context || undefined,
      });
    },
    [chatMutation, messages, context]
  );

  const excludeDoc = useCallback(
    async (documentId: string) => {
      if (!context) return;
      await excludeMutation.mutateAsync({ documentId, ctx: context });
    },
    [excludeMutation, context]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setContext(null);
  }, []);

  return {
    messages,
    context,
    isLoading: chatMutation.isPending || excludeMutation.isPending,
    error: chatMutation.error || excludeMutation.error,
    sendMessage,
    excludeDoc,
    clearChat,
  };
}
