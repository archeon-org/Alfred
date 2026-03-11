import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SearchController } from 'src/search/search.controller';

describe('SearchController', () => {
  const searchService = {
    hybridSearch: jest.fn(),
  };
  const ragService = {
    askQuestion: jest.fn(),
    chatStream: jest.fn(),
    questionStream: jest.fn(),
  };
  const chatSearchService = {
    chat: jest.fn(),
    createContext: jest.fn(),
    excludeDocument: jest.fn(),
    hydrateChatResponse: jest.fn(),
  };
  const subscriptionService = {
    useAiSearch: jest.fn(),
  };

  const controller = new SearchController(
    searchService as any,
    ragService as any,
    chatSearchService as any,
    subscriptionService as any,
  );
  const req = { user: { id: 'user-1' } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates search query', async () => {
    await expect(
      controller.search(req as any, { q: '' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.search(req as any, { q: 'a' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns mapped search response with normalized limit and similarity', async () => {
    searchService.hybridSearch.mockResolvedValue([
      {
        document: {
          id: 'doc-1',
          filename: 'f',
          originalName: 'o',
          title: 't',
          description: 'd',
          thumbnailPath: null,
          categoryId: null,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
        },
        similarity: 0.1234,
        bestSnippet: 'snippet',
        citations: [],
        matchReason: 'chunk-match',
      },
    ]);

    await expect(
      controller.search(
        req as any,
        { q: '  hello  ', limit: 99, mode: 'semantic' } as any,
      ),
    ).resolves.toEqual({
      query: 'hello',
      mode: 'semantic',
      count: 1,
      results: [
        {
          id: 'doc-1',
          filename: 'f',
          originalName: 'o',
          title: 't',
          description: 'd',
          thumbnailPath: null,
          categoryId: null,
          similarity: 0.12,
          bestSnippet: 'snippet',
          citations: [],
          matchReason: 'chunk-match',
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
        },
      ],
    });

    expect(searchService.hybridSearch).toHaveBeenCalledWith(
      'user-1',
      'hello',
      50,
      'semantic',
    );
  });

  it('validates chat request message', async () => {
    await expect(
      controller.chat(req as any, { message: '' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects chat when daily limit is exhausted', async () => {
    subscriptionService.useAiSearch.mockResolvedValue({
      allowed: false,
      resetsAt: new Date('2024-01-01T00:00:00.000Z'),
      remainingSearches: 0,
      bonusSearches: 0,
    });

    await expect(
      controller.chat(req as any, { message: 'Hello' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns chat response and limit info', async () => {
    subscriptionService.useAiSearch.mockResolvedValue({
      allowed: true,
      remainingSearches: 3,
      bonusSearches: 1,
      resetsAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    chatSearchService.createContext.mockReturnValue({
      excludedDocumentIds: [],
      refinements: [],
      lastQuery: '',
      failedAttempts: 0,
      searchAttempts: 0,
    });
    chatSearchService.chat.mockResolvedValue({
      response: { role: 'assistant', content: 'Answer' },
      updatedContext: {
        excludedDocumentIds: [],
        refinements: ['Hello'],
        lastQuery: 'Hello',
        failedAttempts: 0,
        searchAttempts: 1,
      },
    });

    await expect(
      controller.chat(req as any, { message: '  Hello  ' } as any),
    ).resolves.toEqual({
      response: { role: 'assistant', content: 'Answer' },
      context: {
        excludedDocumentIds: [],
        refinements: ['Hello'],
        lastQuery: 'Hello',
        failedAttempts: 0,
        searchAttempts: 1,
      },
      searchLimitInfo: {
        remainingSearches: 3,
        bonusSearches: 1,
        resetsAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    });

    expect(chatSearchService.chat).toHaveBeenCalledWith(
      'user-1',
      'Hello',
      [],
      {
        excludedDocumentIds: [],
        refinements: [],
        lastQuery: '',
        failedAttempts: 0,
        searchAttempts: 0,
      },
      'normal',
      expect.objectContaining({
        user_id: 'user-1',
      }),
    );
  });

  it('validates excludeDocument payload', async () => {
    await expect(
      controller.excludeDocument({ context: {} } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.excludeDocument({ documentId: 'doc-1' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('excludes document from context', async () => {
    const updatedContext = {
      excludedDocumentIds: ['doc-1'],
      refinements: [],
      lastQuery: '',
      failedAttempts: 1,
      searchAttempts: 1,
    };
    chatSearchService.excludeDocument.mockReturnValue(updatedContext);

    await expect(
      controller.excludeDocument({
        documentId: 'doc-1',
        context: {
          excludedDocumentIds: [],
          refinements: [],
          lastQuery: '',
          failedAttempts: 0,
          searchAttempts: 1,
        },
      } as any),
    ).resolves.toEqual({ context: updatedContext });
  });

  it('validates question payload and search allowance', async () => {
    await expect(
      controller.question(req as any, { question: 'ab' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.question(req as any, { question: 'a'.repeat(2001) } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    subscriptionService.useAiSearch.mockResolvedValue({
      allowed: false,
      resetsAt: new Date(),
      remainingSearches: 0,
      bonusSearches: 0,
    });

    await expect(
      controller.question(req as any, { question: 'Valid question' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns mapped question response', async () => {
    subscriptionService.useAiSearch.mockResolvedValue({
      allowed: true,
      remainingSearches: 2,
      bonusSearches: 0,
      resetsAt: new Date(),
    });
    ragService.askQuestion.mockResolvedValue({
      answer: 'Answer',
      citations: [{ chunkId: 'chunk-1' }],
      confidence: 'high',
      processing_time_ms: 123,
    });

    await expect(
      controller.question(
        req as any,
        { question: '  What is this?  ', conversationHistory: [] } as any,
      ),
    ).resolves.toEqual({
      answer: 'Answer',
      citations: [{ chunkId: 'chunk-1' }],
      confidence: 'high',
      processingTimeMs: 123,
    });

    expect(ragService.askQuestion).toHaveBeenCalledWith(
      'user-1',
      'What is this?',
      [],
      15,
      'normal',
      expect.objectContaining({
        user_id: 'user-1',
      }),
    );
  });

  it('throws when question service returns null', async () => {
    subscriptionService.useAiSearch.mockResolvedValue({
      allowed: true,
      remainingSearches: 2,
      bonusSearches: 0,
      resetsAt: new Date(),
    });
    ragService.askQuestion.mockResolvedValue(null);

    await expect(
      controller.question(req as any, { question: 'Valid question' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forwards chat stream request and mode', async () => {
    const streamResponse = { ok: true, body: {} };
    const pipeSpy = jest
      .spyOn(controller as any, 'pipeChatNdjsonStream')
      .mockResolvedValue(undefined);
    const res = { on: jest.fn(), off: jest.fn() };
    subscriptionService.useAiSearch.mockResolvedValue({
      allowed: true,
      remainingSearches: 2,
      bonusSearches: 0,
      resetsAt: new Date(),
    });
    ragService.chatStream.mockResolvedValue(streamResponse);

    await controller.chatStream(
      req as any,
      {
        message: '  hello  ',
        conversationHistory: [],
        agentMode: 'reasoning',
      } as any,
      res as any,
    );

    expect(ragService.chatStream).toHaveBeenCalledWith(
      'user-1',
      'hello',
      [],
      15,
      'reasoning',
      expect.any(AbortSignal),
      expect.objectContaining({
        user_id: 'user-1',
      }),
    );
    expect(pipeSpy).toHaveBeenCalledWith(
      res,
      streamResponse,
      'user-1',
      'hello',
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('forwards question stream request with default mode', async () => {
    const streamResponse = { ok: true, body: {} };
    const pipeSpy = jest
      .spyOn(controller as any, 'pipeNdjsonStream')
      .mockResolvedValue(undefined);
    const res = { on: jest.fn(), off: jest.fn() };
    subscriptionService.useAiSearch.mockResolvedValue({
      allowed: true,
      remainingSearches: 2,
      bonusSearches: 0,
      resetsAt: new Date(),
    });
    ragService.questionStream.mockResolvedValue(streamResponse);

    await controller.questionStream(
      req as any,
      { question: '  explain this  ', conversationHistory: [] } as any,
      res as any,
    );

    expect(ragService.questionStream).toHaveBeenCalledWith(
      'user-1',
      'explain this',
      [],
      15,
      'normal',
      expect.any(AbortSignal),
      expect.objectContaining({
        user_id: 'user-1',
      }),
    );
    expect(pipeSpy).toHaveBeenCalledWith(res, streamResponse);
  });
});
