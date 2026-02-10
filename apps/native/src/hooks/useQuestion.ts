import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  askQuestion,
  QuestionResponse,
  ConversationMessage,
} from "../services/question";

export interface UseQuestionReturn {
  /** Current conversation history */
  messages: ConversationMessage[];
  /** Loading state */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;
  /** Last answer received */
  lastAnswer: QuestionResponse | null;
  /** Ask a question */
  ask: (question: string) => Promise<void>;
  /** Clear conversation history */
  clearHistory: () => void;
}

/**
 * Hook for asking questions to your Second Brain
 *
 * @example
 * const { messages, ask, isLoading, lastAnswer } = useQuestion();
 *
 * // Ask a question
 * await ask("What invoices do I have pending?");
 *
 * // Check the answer
 * console.log(lastAnswer?.answer);
 * console.log(`Confidence: ${lastAnswer?.confidence}`);
 *
 * // Follow-up question (uses conversation history)
 * await ask("What about from last month?");
 */
export function useQuestion(): UseQuestionReturn {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [lastAnswer, setLastAnswer] = useState<QuestionResponse | null>(null);

  const questionMutation = useMutation<
    QuestionResponse,
    Error,
    { question: string; history: ConversationMessage[] }
  >({
    mutationFn: ({ question, history }) => askQuestion(question, history),
    onSuccess: (data, variables) => {
      // Add user question to history
      const userMessage: ConversationMessage = {
        role: "user",
        content: variables.question,
      };

      // Add assistant response to history
      const assistantMessage: ConversationMessage = {
        role: "assistant",
        content: data.answer,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setLastAnswer(data);
    },
  });

  const ask = useCallback(
    async (question: string) => {
      await questionMutation.mutateAsync({
        question,
        history: messages,
      });
    },
    [questionMutation, messages]
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
    setLastAnswer(null);
  }, []);

  return {
    messages,
    isLoading: questionMutation.isPending,
    error: questionMutation.error,
    lastAnswer,
    ask,
    clearHistory,
  };
}
