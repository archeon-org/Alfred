import api from "./api";

export interface SearchResult {
  id: string;
  filename: string;
  originalName: string;
  title: string | null;
  description: string | null;
  thumbnailPath: string | null;
  categoryId: string | null;
  similarity: number;
  matchReason?: string;
  createdAt: string;
}

export interface SearchResponse {
  query: string;
  mode: string;
  count: number;
  results: SearchResult[];
}

export interface SearchParams {
  q: string;
  limit?: number;
  mode?: "semantic" | "hybrid";
}

/**
 * Semantic search for documents
 * Supports natural language queries like:
 * - "electricity bill from january"
 * - "my passport"
 * - "the contract I signed last month"
 */
export const searchDocuments = async (
  params: SearchParams
): Promise<SearchResponse> => {
  const response = await api.get<SearchResponse>("/search", {
    params: {
      q: params.q,
      limit: params.limit,
      mode: params.mode || "hybrid",
    },
  });
  return response.data;
};

// ============================================
// Chat-based Document Search
// ============================================

export interface DocumentSuggestion {
  id: string;
  title: string | null;
  originalName: string;
  categoryName: string | null;
  categoryColor: string | null;
  thumbnailPath: string | null;
  similarity: number;
  createdAt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  documents?: DocumentSuggestion[];
  timestamp?: string;
}

export interface ChatContext {
  excludedDocumentIds: string[];
  refinements: string[];
  lastQuery: string;
  failedAttempts: number;
  searchAttempts: number;
}

export interface SearchLimitInfo {
  remainingSearches: number;
  bonusSearches: number;
  resetsAt: string;
}

export interface ChatResponse {
  response: ChatMessage;
  context: ChatContext;
  searchLimitInfo?: SearchLimitInfo;
}

/**
 * Send a chat message to search for documents
 */
export const sendChatMessage = async (
  message: string,
  conversationHistory: ChatMessage[] = [],
  context?: ChatContext
): Promise<ChatResponse> => {
  const response = await api.post<ChatResponse>("/search/chat", {
    message,
    conversationHistory,
    context,
  });
  return response.data;
};

/**
 * Exclude a document from search results
 */
export const excludeDocument = async (
  documentId: string,
  context: ChatContext
): Promise<{ context: ChatContext }> => {
  const response = await api.post<{ context: ChatContext }>(
    "/search/chat/exclude",
    {
      documentId,
      context,
    }
  );
  return response.data;
};
