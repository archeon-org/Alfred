import api from "./api";
import Config from "../constants/Config";
import { RagAgentMode, RagCitation } from "./search";
import { consumeNdjsonStream, fetchStreamResponse } from "./streaming";

export interface QuestionResponse {
  answer: string;
  citations: RagCitation[];
  confidence: "high" | "medium" | "low";
  processingTimeMs: number;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface QuestionStreamEvent {
  type: "event" | "answer_delta" | "result";
  stage?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  delta?: string;
  answer?: string;
}

interface RawCitation {
  chunk_id: string;
  document_id: string;
  snippet: string;
  score: number;
  start_offset: number;
  end_offset: number;
}

type StreamPayload =
  | {
      type: "event";
      stage?: string;
      message?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: "result";
      answer: string;
      citations?: RawCitation[];
      confidence?: "high" | "medium" | "low";
      processing_time_ms?: number;
    }
  | {
      type: "error";
      message?: string;
    }
  | {
      type: "answer_delta";
      delta?: string;
    };

const mapCitations = (citations: RawCitation[] | undefined): RagCitation[] =>
  (citations || []).map((citation) => ({
    chunkId: citation.chunk_id,
    documentId: citation.document_id,
    snippet: citation.snippet,
    score: citation.score,
    startOffset: citation.start_offset,
    endOffset: citation.end_offset,
  }));

export const askQuestion = async (
  question: string,
  conversationHistory?: ConversationMessage[],
  agentMode: RagAgentMode = "normal",
): Promise<QuestionResponse> => {
  const response = await api.post<QuestionResponse>("/question", {
    question,
    conversationHistory,
    agentMode,
  });
  return {
    ...response.data,
    citations: response.data.citations || [],
  };
};

export const streamQuestion = async (
  question: string,
  conversationHistory: ConversationMessage[] = [],
  agentMode: RagAgentMode = "normal",
  onEvent?: (event: QuestionStreamEvent) => void,
  signal?: AbortSignal,
): Promise<QuestionResponse> => {
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
    `${Config.API_URL}/question/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(timezone ? { "X-Timezone": timezone } : {}),
      },
      body: JSON.stringify({
        question,
        conversationHistory,
        agentMode,
      }),
      signal,
    },
  );

  if (!response.ok) {
    const message = (await response.text().catch(() => "")) || "Stream failed";
    throw new Error(message);
  }

  let finalResult: QuestionResponse | null = null;

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let payload: StreamPayload;
    try {
      payload = JSON.parse(trimmed) as StreamPayload;
    } catch {
      return;
    }

    if (payload.type === "event") {
      onEvent?.({
        type: "event",
        stage: payload.stage || "working",
        message: payload.message || "Working...",
        metadata: payload.metadata,
      });
      return;
    }

    if (payload.type === "error") {
      throw new Error(payload.message || "Stream failed");
    }

    if (payload.type === "result") {
      onEvent?.({
        type: "result",
        answer: payload.answer || "",
      });
      finalResult = {
        answer: payload.answer || "",
        citations: mapCitations(payload.citations),
        confidence: payload.confidence || "low",
        processingTimeMs: payload.processing_time_ms || 0,
      };
      return;
    }

    if (payload.type === "answer_delta") {
      onEvent?.({
        type: "answer_delta",
        delta: payload.delta || "",
      });
    }
  };

  await consumeNdjsonStream(response, processLine);

  if (finalResult) {
    return finalResult;
  }

  throw new Error("Stream completed without result");
};

export const quickAnswer = async (
  question: string,
): Promise<{ answer: string; confidence: string }> => {
  const response = await api.post<{ answer: string; confidence: string }>(
    "/question/quick",
    { question },
  );
  return response.data;
};
