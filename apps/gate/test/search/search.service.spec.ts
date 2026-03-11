import { SearchService } from 'src/search/search.service';

describe('SearchService', () => {
  const documentRepository = {
    find: jest.fn(),
  };
  const ragService = {
    searchDocuments: jest.fn(),
  };

  const service = new SearchService(
    documentRepository as any,
    ragService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty list when rag has no matches', async () => {
    ragService.searchDocuments.mockResolvedValue([]);

    await expect(
      service.hybridSearch('user-1', 'query', 10, 'hybrid'),
    ).resolves.toEqual([]);
    expect(documentRepository.find).not.toHaveBeenCalled();
  });

  it('maps rag matches to owned documents', async () => {
    ragService.searchDocuments.mockResolvedValue([
      {
        document_id: 'doc-1',
        score: 0.9,
        best_snippet: 'Best',
        citations: [{ chunkId: 'chunk-1' }],
      },
      {
        document_id: 'doc-2',
        score: 0.4,
        best_snippet: 'Other',
        citations: [],
      },
    ]);
    documentRepository.find.mockResolvedValue([
      { id: 'doc-1', title: 'A' },
      { id: 'doc-2', title: 'B' },
    ]);

    await expect(
      service.hybridSearch('user-1', 'query', 5, 'semantic'),
    ).resolves.toEqual([
      {
        document: { id: 'doc-1', title: 'A' },
        similarity: 0.9,
        matchReason: 'chunk-match',
        bestSnippet: 'Best',
        citations: [{ chunkId: 'chunk-1' }],
      },
      {
        document: { id: 'doc-2', title: 'B' },
        similarity: 0.4,
        matchReason: 'chunk-match',
        bestSnippet: 'Other',
        citations: [],
      },
    ]);
  });

  it('filters out rag hits whose documents are not found', async () => {
    ragService.searchDocuments.mockResolvedValue([
      {
        document_id: 'doc-1',
        score: 0.9,
        best_snippet: 'Best',
        citations: [],
      },
      {
        document_id: 'missing-doc',
        score: 0.2,
        best_snippet: 'Missing',
        citations: [],
      },
    ]);
    documentRepository.find.mockResolvedValue([{ id: 'doc-1' }]);

    await expect(service.hybridSearch('user-1', 'query')).resolves.toHaveLength(
      1,
    );
  });
});
