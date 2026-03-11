import { RagService } from 'src/search/rag.service';

describe('RagService', () => {
  const makeConfigService = (values: Record<string, string | undefined>) => ({
    get: jest.fn((key: string) => values[key]),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('returns disabled state without INTERNAL_API_KEY', () => {
    const service = new RagService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: '',
      }) as any,
    );

    expect(service.isEnabled()).toBe(false);
  });

  it('returns empty search results when disabled', async () => {
    const service = new RagService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: '',
      }) as any,
    );

    await expect(service.searchDocuments('user-1', 'query')).resolves.toEqual(
      [],
    );
  });

  it('normalizes search result citations', async () => {
    const service = new RagService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: 'key',
      }) as any,
    );
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        query: 'q',
        user_id: 'user-1',
        count: 1,
        processing_time_ms: 10,
        documents: [
          {
            document_id: 'doc-1',
            score: 0.98,
            best_snippet: 'snippet',
            citations: [
              {
                chunk_id: 'chunk-1',
                document_id: 'doc-1',
                snippet: 'snippet',
                score: 0.98,
                start_offset: 0,
                end_offset: 12,
              },
            ],
          },
        ],
      }),
    });

    await expect(
      service.searchDocuments('user-1', 'query', 3, 'semantic'),
    ).resolves.toEqual([
      {
        document_id: 'doc-1',
        score: 0.98,
        best_snippet: 'snippet',
        citations: [
          {
            chunkId: 'chunk-1',
            documentId: 'doc-1',
            snippet: 'snippet',
            score: 0.98,
            startOffset: 0,
            endOffset: 12,
          },
        ],
      },
    ]);
  });

  it('returns null chat response on non-ok status', async () => {
    const service = new RagService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: 'key',
      }) as any,
    );
    (global as any).fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'error',
    });

    await expect(service.chat('user-1', 'hello')).resolves.toBeNull();
  });

  it('normalizes chat response', async () => {
    const service = new RagService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: 'key',
      }) as any,
    );
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'A',
        citations: [
          {
            chunk_id: 'chunk-1',
            document_id: 'doc-1',
            snippet: 's',
            score: 0.8,
            start_offset: 1,
            end_offset: 2,
          },
        ],
        processing_time_ms: 33,
        confidence: 'medium',
      }),
    });

    await expect(service.chat('user-1', 'hello')).resolves.toEqual({
      answer: 'A',
      citations: [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          snippet: 's',
          score: 0.8,
          startOffset: 1,
          endOffset: 2,
        },
      ],
      processing_time_ms: 33,
      confidence: 'medium',
    });
  });

  it('returns null for failed question request', async () => {
    const service = new RagService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: 'key',
      }) as any,
    );
    (global as any).fetch.mockRejectedValue(new Error('network'));

    await expect(service.askQuestion('user-1', 'Q')).resolves.toBeNull();
  });

  it('forwards question request with reasoning mode', async () => {
    const service = new RagService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: 'key',
      }) as any,
    );
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'A',
        citations: [],
        processing_time_ms: 10,
        confidence: 'high',
      }),
    });

    await service.askQuestion('user-1', 'Q', [], 15, 'reasoning', {
      user_id: 'user-1',
      full_name: 'Test User',
      timezone: 'UTC',
      locale: 'en-US',
      current_date: '2026-03-06',
      current_datetime_iso: '2026-03-06T12:00:00.000Z',
      day_of_week: 'Friday',
    });

    const [, init] = (global as any).fetch.mock.calls[0];
    const payload = JSON.parse(init.body);
    expect(payload.agent_mode).toBe('reasoning');
    expect(payload.user_context.user_id).toBe('user-1');
  });

  it('returns null chat stream when disabled', async () => {
    const service = new RagService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: '',
      }) as any,
    );

    await expect(service.chatStream('user-1', 'hello')).resolves.toBeNull();
  });

  it('forwards question stream response', async () => {
    const service = new RagService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: 'key',
      }) as any,
    );
    const streamResponse = { ok: true, status: 200, body: {} } as any;
    (global as any).fetch.mockResolvedValue(streamResponse);

    await expect(service.questionStream('user-1', 'question')).resolves.toBe(
      streamResponse,
    );
  });

  it('returns null for failed backfill request', async () => {
    const service = new RagService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: 'key',
      }) as any,
    );
    (global as any).fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'error',
    });

    await expect(service.triggerBackfill('admin', 50)).resolves.toBeNull();
  });
});
