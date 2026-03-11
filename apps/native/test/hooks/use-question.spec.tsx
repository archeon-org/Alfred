import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react-test-renderer";
import { renderHook } from "../helpers/renderHook";

const mockAskQuestion = jest.fn();

jest.mock("../../src/services/question", () => ({
  askQuestion: (...args: any[]) => mockAskQuestion(...args),
}));

import { useQuestion } from "../../src/hooks/useQuestion";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("hooks/useQuestion", () => {
  beforeEach(() => {
    mockAskQuestion.mockReset();
  });

  it("tracks conversation history across follow-up questions", async () => {
    mockAskQuestion
      .mockResolvedValueOnce({ answer: "First answer", confidence: "high" })
      .mockResolvedValueOnce({ answer: "Second answer", confidence: "medium" });

    const { result } = renderHook(() => useQuestion(), createWrapper());

    await act(async () => {
      await result.current.ask("What is invoice A?");
    });

    expect(mockAskQuestion).toHaveBeenNthCalledWith(
      1,
      "What is invoice A?",
      [],
    );
    expect(result.current.messages).toEqual([
      { role: "user", content: "What is invoice A?" },
      { role: "assistant", content: "First answer" },
    ]);
    expect(result.current.lastAnswer?.answer).toBe("First answer");

    await act(async () => {
      await result.current.ask("And invoice B?");
    });

    expect(mockAskQuestion).toHaveBeenNthCalledWith(2, "And invoice B?", [
      { role: "user", content: "What is invoice A?" },
      { role: "assistant", content: "First answer" },
    ]);
    expect(result.current.messages).toHaveLength(4);
  });

  it("exposes error state and supports clearing history", async () => {
    mockAskQuestion.mockRejectedValue(new Error("service unavailable"));

    const { result } = renderHook(() => useQuestion(), createWrapper());

    await act(async () => {
      await expect(result.current.ask("hello")).rejects.toThrow(
        "service unavailable",
      );
    });

    expect(result.current.error?.message).toBe("service unavailable");

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.lastAnswer).toBeNull();
  });
});
