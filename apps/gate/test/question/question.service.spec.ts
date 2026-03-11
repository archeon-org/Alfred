import { QuestionService } from 'src/question/question.service';

describe('QuestionService', () => {
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

  it('is disabled when INTERNAL_API_KEY is missing', () => {
    const service = new QuestionService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: '',
      }) as any,
    );

    expect(service.isEnabled()).toBe(false);
  });

  it('throws from ask when service is disabled', async () => {
    const service = new QuestionService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: '',
      }) as any,
    );

    await expect(service.ask('user-1', 'question')).rejects.toThrow(
      'Question API is not configured',
    );
  });

  it('calls ask endpoint and normalizes citations', async () => {
    const service = new QuestionService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: 'internal-key',
      }) as any,
    );
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'Answer',
        citations: [
          {
            chunk_id: 'chunk-1',
            document_id: 'doc-1',
            snippet: 'text',
            score: 0.9,
            start_offset: 1,
            end_offset: 10,
          },
        ],
        processing_time_ms: 55,
        confidence: 'high',
      }),
    });

    await expect(
      service.ask('user-1', 'What is this?', {
        maxContextResults: 20,
        conversationHistory: [{ role: 'user', content: 'Hello' }],
        userContext: {
          user_id: 'user-1',
          full_name: 'Test User',
          email: 'test@example.com',
          timezone: 'UTC',
          locale: 'en-US',
          current_date: '2026-03-06',
          current_datetime_iso: '2026-03-06T12:00:00.000Z',
          day_of_week: 'Friday',
        },
      }),
    ).resolves.toEqual({
      answer: 'Answer',
      citations: [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          snippet: 'text',
          score: 0.9,
          startOffset: 1,
          endOffset: 10,
        },
      ],
      processingTimeMs: 55,
      confidence: 'high',
    });

    expect((global as any).fetch).toHaveBeenCalledWith(
      'http://scribe/api/rag/question',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-API-Key': 'internal-key',
        },
      }),
    );
    const [, init] = (global as any).fetch.mock.calls[0];
    const payload = JSON.parse(init.body);
    expect(payload.user_context).toEqual({
      user_id: 'user-1',
      full_name: 'Test User',
      email: 'test@example.com',
      timezone: 'UTC',
      locale: 'en-US',
      current_date: '2026-03-06',
      current_datetime_iso: '2026-03-06T12:00:00.000Z',
      day_of_week: 'Friday',
    });
  });

  it('throws when ask endpoint returns non-200', async () => {
    const service = new QuestionService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: 'internal-key',
      }) as any,
    );
    (global as any).fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'error',
    });

    await expect(service.ask('user-1', 'Q')).rejects.toThrow(
      'Question API failed: 500',
    );
  });

  it('returns quick answer response', async () => {
    const service = new QuestionService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: 'internal-key',
      }) as any,
    );
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'Quick',
        confidence: 'low',
      }),
    });

    await expect(
      service.quickAnswer('user-1', 'Q', {
        user_id: 'user-1',
        full_name: 'Test User',
        timezone: 'UTC',
        locale: 'en-US',
        current_date: '2026-03-06',
        current_datetime_iso: '2026-03-06T12:00:00.000Z',
        day_of_week: 'Friday',
      }),
    ).resolves.toEqual({
      answer: 'Quick',
      confidence: 'low',
    });
    const [, init] = (global as any).fetch.mock.calls[0];
    const payload = JSON.parse(init.body);
    expect(payload.user_context.full_name).toBe('Test User');
  });

  it('throws when quick answer endpoint fails', async () => {
    const service = new QuestionService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: 'internal-key',
      }) as any,
    );
    (global as any).fetch.mockResolvedValue({
      ok: false,
      status: 503,
    });

    await expect(service.quickAnswer('user-1', 'Q')).rejects.toThrow(
      'Quick answer failed: 503',
    );
  });

  it('returns null stream response when disabled', async () => {
    const service = new QuestionService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: '',
      }) as any,
    );

    await expect(service.stream('user-1', 'Q')).resolves.toBeNull();
  });

  it('forwards stream request payload with agent mode', async () => {
    const service = new QuestionService(
      makeConfigService({
        SCRIBE_API_URL: 'http://scribe',
        INTERNAL_API_KEY: 'internal-key',
      }) as any,
    );
    const streamResponse = { ok: true, status: 200, body: {} } as any;
    (global as any).fetch.mockResolvedValue(streamResponse);

    await expect(
      service.stream('user-1', 'Question', {
        maxContextResults: 7,
        conversationHistory: [{ role: 'user', content: 'prev' }],
        agentMode: 'reasoning',
        userContext: {
          user_id: 'user-1',
          timezone: 'UTC',
          locale: 'en-US',
          current_date: '2026-03-06',
          current_datetime_iso: '2026-03-06T12:00:00.000Z',
          day_of_week: 'Friday',
        },
      }),
    ).resolves.toBe(streamResponse);

    const [, init] = (global as any).fetch.mock.calls[0];
    const payload = JSON.parse(init.body);
    expect(payload.agent_mode).toBe('reasoning');
    expect(payload.max_context_results).toBe(7);
    expect(payload.conversation_history).toEqual([
      { role: 'user', content: 'prev' },
    ]);
    expect(payload.user_context.user_id).toBe('user-1');
  });
});
