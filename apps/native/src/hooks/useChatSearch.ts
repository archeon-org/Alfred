import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  streamChatMessage,
  sendChatMessage,
  excludeDocument,
  ChatMessage,
  ChatContext,
  ChatResponse,
  RagAgentMode,
  SearchLimitInfo,
} from "../services/search";
import { SUBSCRIPTION_QUERY_KEY } from "./useSubscription";

export interface UseChatSearchReturn {
  messages: ChatMessage[];
  context: ChatContext | null;
  isLoading: boolean;
  error: Error | null;
  searchLimitInfo: SearchLimitInfo | null;
  streamStage: string | null;
  streamSteps: string[];
  streamAnswer: string;
  sendMessage: (message: string, agentMode?: RagAgentMode) => Promise<void>;
  excludeDoc: (documentId: string) => Promise<void>;
  clearChat: () => void;
}

/**
 * Hook for chat-based document search
 *
 * @example
 * const { messages, sendMessage, isLoading, searchLimitInfo } = useChatSearch();
 *
 * // Send a message
 * await sendMessage("I'm looking for my electricity bill from January");
 *
 * // Give feedback
 * await sendMessage("Not that one, something more recent");
 *
 * // Exclude a document from results
 * await excludeDoc(documentId);
 *
 * // Check remaining searches
 * console.log(searchLimitInfo?.remainingSearches);
 */
export function useChatSearch(): UseChatSearchReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [context, setContext] = useState<ChatContext | null>(null);
  const [searchLimitInfo, setSearchLimitInfo] =
    useState<SearchLimitInfo | null>(null);
  const [streamStage, setStreamStage] = useState<string | null>(null);
  const [streamSteps, setStreamSteps] = useState<string[]>([]);
  const [streamAnswer, setStreamAnswer] = useState("");
  const queryClient = useQueryClient();

  const chatMutation = useMutation<
    ChatResponse,
    Error,
    {
      message: string;
      history: ChatMessage[];
      ctx: ChatContext | undefined;
      agentMode: RagAgentMode;
    }
  >({
    mutationFn: async ({ message, history, ctx, agentMode }) => {
      try {
        return await streamChatMessage(
          message,
          history,
          ctx,
          agentMode,
          (event) => {
            if (event.type === "event") {
              const step = event.message || "Searching...";
              setStreamStage(step);
              setStreamSteps((prev) =>
                prev[prev.length - 1] === step
                  ? prev
                  : [...prev, step].slice(-8),
              );
              return;
            }

            if (event.type === "answer_delta" && event.delta) {
              setStreamAnswer((prev) => `${prev}${event.delta || ""}`);
            }
          },
        );
      } catch {
        return sendChatMessage(message, history, ctx, agentMode);
      }
    },
    onMutate: () => {
      setStreamStage("Preparing retrieval plan...");
      setStreamSteps(["Preparing retrieval plan..."]);
      setStreamAnswer("");
    },
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

      // Update search limit info
      if (data.searchLimitInfo) {
        setSearchLimitInfo(data.searchLimitInfo);
        // Invalidate subscription query to keep it in sync
        queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
      }
    },
    onSettled: () => {
      setStreamStage(null);
      setStreamSteps([]);
      setStreamAnswer("");
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
    async (message: string, agentMode: RagAgentMode = "normal") => {
      await chatMutation.mutateAsync({
        message,
        history: messages,
        ctx: context || undefined,
        agentMode,
      });
    },
    [chatMutation, messages, context],
  );

  const excludeDoc = useCallback(
    async (documentId: string) => {
      if (!context) return;
      await excludeMutation.mutateAsync({ documentId, ctx: context });
    },
    [excludeMutation, context],
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setContext(null);
    setSearchLimitInfo(null);
    setStreamStage(null);
    setStreamSteps([]);
    setStreamAnswer("");
  }, []);

  return {
    messages,
    context,
    isLoading: chatMutation.isPending || excludeMutation.isPending,
    error: chatMutation.error || excludeMutation.error,
    searchLimitInfo,
    streamStage,
    streamSteps,
    streamAnswer,
    sendMessage,
    excludeDoc,
    clearChat,
  };
}
