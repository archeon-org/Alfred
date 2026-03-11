import api from "./api";
import { consumeNdjsonStream, fetchStreamResponse } from "./streaming";

export type RagAgentMode = "normal" | "reasoning";

export interface RagCitation {
  chunkId: string;
  documentId: string;
  snippet: string;
  score: number;
  startOffset: number;
  endOffset: number;
}

export interface SearchResult {
  id: string;
  filename: string;
  originalName: string;
  title: string | null;
  description: string | null;
  thumbnailPath: string | null;
  categoryId: string | null;
  similarity: number;
  bestSnippet?: string;
  citations: RagCitation[];
  citationCount?: number;
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
  mode?: "semantic" | "hybrid" | "keyword";
}

export const searchDocuments = async (
  params: SearchParams,
): Promise<SearchResponse> => {
  const response = await api.get<SearchResponse>("/search", {
    params: {
      q: params.q,
      limit: params.limit,
      mode: params.mode || "hybrid",
    },
  });

  const payload = response.data;
  payload.results = payload.results.map((result) => ({
    ...result,
    citations: result.citations || [],
    citationCount: (result.citations || []).length,
  }));

  return payload;
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
  citations?: RagCitation[];
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

export interface ChatStreamEvent {
  type: "event" | "answer_delta";
  stage: string;
  message: string;
  metadata?: Record<string, unknown>;
  delta?: string;
}

export const sendChatMessage = async (
  message: string,
  conversationHistory: ChatMessage[] = [],
  context?: ChatContext,
  agentMode: RagAgentMode = "normal",
): Promise<ChatResponse> => {
  const response = await api.post<ChatResponse>("/search/chat", {
    message,
    conversationHistory,
    context,
    agentMode,
  });

  if (response.data.response) {
    response.data.response.citations = response.data.response.citations || [];
  }

  return response.data;
};

type ChatStreamPayload =
  | {
      type: "event";
      stage?: string;
      message?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: "result";
      response?: ChatMessage;
      context?: ChatContext;
      searchLimitInfo?: SearchLimitInfo;
    }
  | {
      type: "error";
      message?: string;
    }
  | {
      type: "answer_delta";
      delta?: string;
    };

const normalizeChatResponse = (data: ChatResponse): ChatResponse => ({
  ...data,
  response: {
    ...data.response,
    citations: data.response?.citations || [],
  },
});

export const streamChatMessage = async (
  message: string,
  conversationHistory: ChatMessage[] = [],
  context?: ChatContext,
  agentMode: RagAgentMode = "normal",
  onEvent?: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<ChatResponse> => {
  let token: string | null = null;
  let timezone: string | null = null;
  try {
    const secureStore = await import("expo-secure-store");
    token = await secureStore.getItemAsync("auth_token");
  } catch {
    token = null;
  }
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    timezone = null;
  }

  const response = await fetchStreamResponse(
    `${api.defaults.baseURL}/search/chat/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(timezone ? { "X-Timezone": timezone } : {}),
      },
      body: JSON.stringify({
        message,
        conversationHistory,
        context,
        agentMode,
      }),
      signal,
    },
  );

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")) || "Stream failed";
    throw new Error(detail);
  }

  let finalResult: ChatResponse | null = null;

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let payload: ChatStreamPayload;
    try {
      payload = JSON.parse(trimmed) as ChatStreamPayload;
    } catch {
      return;
    }

    if (payload.type === "event") {
      onEvent?.({
        type: "event",
        stage: payload.stage || "working",
        message: payload.message || "Searching...",
        metadata: payload.metadata,
      });
      return;
    }

    if (payload.type === "error") {
      throw new Error(payload.message || "Stream failed");
    }

    if (payload.type === "answer_delta") {
      onEvent?.({
        type: "answer_delta",
        stage: "generate_answer",
        message: "Streaming answer...",
        delta: payload.delta || "",
      });
      return;
    }

    if (payload.type === "result" && payload.response && payload.context) {
      finalResult = normalizeChatResponse({
        response: payload.response,
        context: payload.context,
        searchLimitInfo: payload.searchLimitInfo,
      });
    }
  };

  await consumeNdjsonStream(response, processLine);

  if (finalResult) {
    return finalResult;
  }

  throw new Error("Stream completed without result");
};

export const excludeDocument = async (
  documentId: string,
  context: ChatContext,
): Promise<{ context: ChatContext }> => {
  const response = await api.post<{ context: ChatContext }>(
    "/search/chat/exclude",
    {
      documentId,
      context,
    },
  );
  return response.data;
};
