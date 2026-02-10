import api from "./api";

/**
 * Response from asking a question to your Second Brain
 */
export interface QuestionResponse {
  answer: string;
  sources: string[];
  confidence: "high" | "medium" | "low";
  processingTimeMs: number;
}

/**
 * Message in a conversation
 */
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Ask a question to your Second Brain
 *
 * Uses the knowledge graph built from your documents to answer questions
 * using RAG (Retrieval Augmented Generation).
 *
 * @param question - The question to ask
 * @param conversationHistory - Optional previous messages for context
 * @returns The AI-generated answer with sources
 *
 * @example
 * const result = await askQuestion("What invoices do I have pending?");
 * console.log(result.answer);
 * console.log(`Confidence: ${result.confidence}`);
 */
export const askQuestion = async (
  question: string,
  conversationHistory?: ConversationMessage[]
): Promise<QuestionResponse> => {
  const response = await api.post<QuestionResponse>("/question", {
    question,
    conversationHistory,
  });
  return response.data;
};

/**
 * Quick question - returns just the answer
 *
 * @param question - The question to ask
 * @returns Just the answer string and confidence level
 */
export const quickAnswer = async (
  question: string
): Promise<{ answer: string; confidence: string }> => {
  const response = await api.post<{ answer: string; confidence: string }>(
    "/question/quick",
    { question }
  );
  return response.data;
};
