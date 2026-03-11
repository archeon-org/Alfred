jest.mock("../../src/services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    defaults: {
      baseURL: "http://api.test",
    },
  },
}));

import api from "../../src/services/api";
import {
  excludeDocument,
  searchDocuments,
  sendChatMessage,
  streamChatMessage,
} from "../../src/services/search";

const mockedApi = api as jest.Mocked<typeof api>;

describe("search service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it("searchDocuments forwards params and normalizes citation metadata", async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: {
        query: "invoice",
        mode: "hybrid",
        count: 1,
        results: [
          {
            id: "doc-1",
            filename: "a.pdf",
            originalName: "a.pdf",
            title: "Invoice",
            description: null,
            thumbnailPath: null,
            categoryId: null,
            similarity: 0.88,
            createdAt: "2026-01-01",
          },
        ],
      },
    });

    const result = await searchDocuments({ q: "invoice", limit: 5 });

    expect(mockedApi.get).toHaveBeenCalledWith("/search", {
      params: {
        q: "invoice",
        limit: 5,
        mode: "hybrid",
      },
    });
    expect(result.results[0].citations).toEqual([]);
    expect(result.results[0].citationCount).toBe(0);
  });

  it("sendChatMessage and excludeDocument hit expected endpoints", async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: {
        response: {
          role: "assistant",
          content: "Hello",
        },
        context: {
          excludedDocumentIds: [],
          refinements: [],
          lastQuery: "",
          failedAttempts: 0,
          searchAttempts: 1,
        },
      },
    });

    const chat = await sendChatMessage("Hello", [
      { role: "user", content: "Hi" },
    ]);
    expect(chat.response.citations).toEqual([]);
    expect(mockedApi.post).toHaveBeenCalledWith("/search/chat", {
      message: "Hello",
      conversationHistory: [{ role: "user", content: "Hi" }],
      context: undefined,
      agentMode: "normal",
    });

    mockedApi.post.mockResolvedValueOnce({
      data: {
        context: {
          excludedDocumentIds: ["doc-1"],
          refinements: [],
          lastQuery: "x",
          failedAttempts: 0,
          searchAttempts: 1,
        },
      },
    });
    await excludeDocument("doc-1", {
      excludedDocumentIds: [],
      refinements: [],
      lastQuery: "",
      failedAttempts: 0,
      searchAttempts: 0,
    });
    expect(mockedApi.post).toHaveBeenCalledWith("/search/chat/exclude", {
      documentId: "doc-1",
      context: {
        excludedDocumentIds: [],
        refinements: [],
        lastQuery: "",
        failedAttempts: 0,
        searchAttempts: 0,
      },
    });
  });

  it("streamChatMessage parses event and final result payload", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "event",
              stage: "retrieve_chunks",
              message: "Searching chunks",
            }) + "\n",
          ),
        );
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "result",
              response: {
                role: "assistant",
                content: "Found the document",
                citations: [],
              },
              context: {
                excludedDocumentIds: [],
                refinements: [],
                lastQuery: "invoice",
                failedAttempts: 0,
                searchAttempts: 1,
              },
              searchLimitInfo: {
                remainingSearches: 3,
                bonusSearches: 0,
                resetsAt: "2026-01-01T00:00:00.000Z",
              },
            }) + "\n",
          ),
        );
        controller.close();
      },
    });

    const eventMessages: string[] = [];
    (global as any).fetch.mockResolvedValue({
      ok: true,
      body: stream,
    });

    const result = await streamChatMessage(
      "find invoice",
      [],
      undefined,
      "normal",
      (event) => eventMessages.push(event.message),
    );

    expect(eventMessages).toEqual(["Searching chunks"]);
    expect(result.response.content).toBe("Found the document");
    expect((global as any).fetch).toHaveBeenCalledWith(
      "http://api.test/search/chat/stream",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});
