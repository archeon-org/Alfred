import { ChatSearchService } from 'src/search/chat-search.service';

describe('ChatSearchService', () => {
  const ragService = {
    chat: jest.fn(),
  };
  const documentRepository = {
    find: jest.fn(),
  };
  const categoryRepository = {
    findByIds: jest.fn(),
  };
  const service = new ChatSearchService(
    ragService as any,
    documentRepository as any,
    categoryRepository as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates default chat context', () => {
    expect(service.createContext()).toEqual({
      excludedDocumentIds: [],
      refinements: [],
      lastQuery: '',
      failedAttempts: 0,
      searchAttempts: 0,
    });
  });

  it('excludes document once and increments failed attempts', () => {
    const updated = service.excludeDocument(
      {
        excludedDocumentIds: ['doc-1'],
        refinements: [],
        lastQuery: '',
        failedAttempts: 0,
        searchAttempts: 0,
      },
      'doc-1',
    );

    expect(updated.excludedDocumentIds).toEqual(['doc-1']);
    expect(updated.failedAttempts).toBe(1);
  });

  it('throws when rag chat fails', async () => {
    ragService.chat.mockResolvedValue(null);

    await expect(
      service.chat('user-1', 'Need this', [], {
        excludedDocumentIds: [],
        refinements: [],
        lastQuery: '',
        failedAttempts: 0,
        searchAttempts: 0,
      }),
    ).rejects.toThrow('Chat search failed');
  });

  it('builds document suggestions and updates context', async () => {
    ragService.chat.mockResolvedValue({
      answer: 'Result',
      citations: [
        { documentId: 'doc-1', score: 0.9 },
        { documentId: 'doc-2', score: 0.4 },
      ],
    });
    documentRepository.find.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Doc One',
        originalName: 'one.pdf',
        categoryId: 'cat-1',
        thumbnailPath: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      },
      {
        id: 'doc-2',
        title: 'Doc Two',
        originalName: 'two.pdf',
        categoryId: null,
        thumbnailPath: null,
        createdAt: new Date('2024-01-02T00:00:00.000Z'),
      },
    ]);
    categoryRepository.findByIds.mockResolvedValue([
      { id: 'cat-1', name: 'Category 1', color: '#111' },
    ]);

    const context = {
      excludedDocumentIds: [],
      refinements: [],
      lastQuery: '',
      failedAttempts: 0,
      searchAttempts: 1,
    };
    const result = await service.chat('user-1', 'Show docs', [], context);

    expect(result.response.role).toBe('assistant');
    expect(result.response.content).toBe('Result');
    expect(result.response.documents).toEqual([
      expect.objectContaining({
        id: 'doc-1',
        categoryName: 'Category 1',
        categoryColor: '#111',
        similarity: 0.9,
      }),
      expect.objectContaining({
        id: 'doc-2',
        categoryName: null,
        similarity: 0.4,
      }),
    ]);
    expect(result.response.timestamp).toEqual(expect.any(String));
    expect(result.updatedContext).toEqual({
      ...context,
      lastQuery: 'Show docs',
      refinements: ['Show docs'],
      searchAttempts: 2,
    });
  });
});
