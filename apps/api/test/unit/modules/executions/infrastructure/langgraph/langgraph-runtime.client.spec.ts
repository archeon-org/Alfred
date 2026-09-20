import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RUNTIME_NOT_DISPATCHED,
  RuntimeClientError,
} from '@api/modules/executions/application/runtime-client.port';
import type { ExecutionsService } from '@api/modules/executions/application/executions.service';
import { LangGraphRuntimeClient } from '@api/modules/executions/infrastructure/langgraph/langgraph-runtime.client';
import type { MessageAttachmentsService } from '@api/modules/files/application/message-attachments.service';

const executionId = '160c302b-10d5-49cf-81cd-f456f778efea';
const invocationId = '6c858021-63c7-47b1-99d0-7ba67569cd37';
const status = {
  executionId,
  invocationId,
  threadId: '220c302b-10d5-49cf-81cd-f456f778efea',
  runId: '330c302b-10d5-49cf-81cd-f456f778efea',
  status: 'running',
  stopRequested: false,
  replayAvailable: true,
};
const signal = () => new AbortController().signal;
const threadId = status.threadId;
const runId = status.runId;
const metadata = {
  alfred_execution_id: executionId,
  alfred_invocation_id: invocationId,
  alfred_binding_generation: '550c302b-10d5-49cf-81cd-f456f778efea',
};
const nativeRun = { thread_id: threadId, run_id: runId, status: 'running', metadata };
const client = (
  overrides: {
    runId?: string | null;
    dispatchState?: string;
    url?: string;
    titleAssistant?: string;
  } = {},
) =>
  new LangGraphRuntimeClient(
    new ConfigService({
      AGENT_RUNTIME_URL: overrides.url ?? 'https://private-runtime.example',
      AGENT_RUNTIME_ASSISTANT_ID: 'agent',
      AGENT_RUNTIME_TITLE_ASSISTANT_ID: overrides.titleAssistant ?? 'title_agent',
    }),
    {
      resolveRuntime: vi.fn().mockResolvedValue({
        execution: {
          id: executionId,
          invocationId,
          runtimeThreadId: threadId,
          runtimeRunId: overrides.runId === undefined ? runId : overrides.runId,
          bindingGeneration: metadata.alfred_binding_generation,
          dispatchState: overrides.dispatchState ?? 'dispatching',
          stopRequestedAt: null,
        },
        userMessage: 'Persisted user message',
      }),
    } as unknown as ExecutionsService,
  );
const requestString = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Expected string request field');
  return value;
};
const mockFetch = () => vi.stubGlobal('fetch', vi.fn()).mocked(fetch);
const sse = (...parts: string[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } },
  );
async function collect(runtime = client(), after: string | null = null) {
  const events = [];
  for await (const event of runtime.join(executionId, invocationId, { after, signal: signal() })) {
    events.push(event);
  }
  return events;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('direct native LangGraph connection', () => {
  it('creates a resumable background run with persisted input and no new authentication', async () => {
    const request = mockFetch()
      .mockResolvedValueOnce(Response.json({ thread_id: threadId }))
      .mockResolvedValueOnce(Response.json(nativeRun));
    expect(await client({ runId: null }).dispatch(executionId, invocationId, signal())).toEqual(
      status,
    );
    expect(request.mock.calls[0]?.[0]).toBe('https://private-runtime.example/threads');
    expect(JSON.parse(requestString(request.mock.calls[0]?.[1]?.body))).toEqual({
      thread_id: threadId,
      if_exists: 'do_nothing',
    });
    expect(request.mock.calls[1]?.[0]).toBe(
      `https://private-runtime.example/threads/${threadId}/runs`,
    );
    expect(JSON.parse(requestString(request.mock.calls[1]?.[1]?.body))).toMatchObject({
      assistant_id: 'agent',
      input: { messages: [{ role: 'user', content: 'Persisted user message' }] },
      metadata,
      stream_mode: ['messages-tuple', 'updates'],
      stream_resumable: true,
      stream_subgraphs: true,
      multitask_strategy: 'interrupt',
    });
    expect(request.mock.calls[1]?.[1]?.redirect).toBe('error');
    expect(JSON.stringify(request.mock.calls)).not.toMatch(
      /X-API-Key|Authorization|x-uid|alfred\/invocations/,
    );
  });

  it('reconciles a lost POST acknowledgement using native metadata without redispatch', async () => {
    const request = mockFetch()
      .mockResolvedValueOnce(Response.json({ thread_id: threadId }))
      .mockRejectedValueOnce(new Error('PRIVATE_MARKER'))
      .mockResolvedValueOnce(
        Response.json([
          {
            ...nativeRun,
            run_id: invocationId,
            metadata: { ...metadata, alfred_invocation_id: executionId },
          },
          nativeRun,
        ]),
      );
    const runtime = client({ runId: null });
    await expect(runtime.dispatch(executionId, invocationId, signal())).rejects.toMatchObject({
      code: 'runtime_unavailable',
    });
    expect(await runtime.inspect(executionId, invocationId, signal())).toEqual(status);
    expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(2);
    expect(request.mock.calls[2]?.[0]).toBe(
      `https://private-runtime.example/threads/${threadId}/runs?limit=20&offset=0`,
    );
  });

  it('returns unresolved when an uncertain run is absent, including a missing native thread', async () => {
    const request = mockFetch()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(new Response('Not found', { status: 404 }));
    const runtime = client({ runId: null, dispatchState: 'unknown' });
    for (let index = 0; index < 2; index += 1) {
      expect(await runtime.dispatch(executionId, invocationId, signal())).toMatchObject({
        status: 'unresolved',
        runId: null,
        replayAvailable: false,
      });
    }
    expect(request.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
  });

  it('does not treat a previously accepted run disappearing as permission to redispatch', async () => {
    const request = mockFetch().mockResolvedValue(new Response('Gone', { status: 404 }));
    await expect(client().dispatch(executionId, invocationId, signal())).rejects.toMatchObject({
      code: 'runtime_replay_expired',
    });
    expect(request.mock.calls[0]?.[0]).toBe(
      `https://private-runtime.example/threads/${threadId}/runs/${runId}`,
    );
    expect(request.mock.calls[0]?.[1]?.method).toBe('GET');
  });

  it('rejects conflicting native reservations and mismatched run scope', async () => {
    mockFetch()
      .mockResolvedValueOnce(Response.json([nativeRun, { ...nativeRun, run_id: invocationId }]))
      .mockResolvedValueOnce(
        Response.json({
          ...nativeRun,
          metadata: { ...metadata, alfred_execution_id: invocationId },
        }),
      )
      .mockResolvedValueOnce(Response.json({ ...nativeRun, thread_id: invocationId }));
    await expect(
      client({ runId: null }).inspect(executionId, invocationId, signal()),
    ).rejects.toMatchObject({ code: 'runtime_invocation_conflict' });
    for (let index = 0; index < 2; index += 1) {
      await expect(client().inspect(executionId, invocationId, signal())).rejects.toMatchObject({
        code: 'runtime_identity_mismatch',
      });
    }
  });

  it('bounds metadata reconciliation even when the native list never ends', async () => {
    const request = mockFetch().mockImplementation(() =>
      Promise.resolve(
        Response.json(
          Array.from({ length: 20 }, () => ({
            ...nativeRun,
            metadata: { ...metadata, alfred_invocation_id: executionId },
          })),
        ),
      ),
    );
    expect(
      await client({ runId: null }).inspect(executionId, invocationId, signal()),
    ).toMatchObject({ status: 'unresolved' });
    expect(request).toHaveBeenCalledTimes(5);
  });

  it('requests native interrupt and then inspects the actual status instead of assuming cancellation', async () => {
    const request = mockFetch()
      .mockResolvedValueOnce(Response.json(nativeRun))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(Response.json(nativeRun));
    expect(await client().cancel(executionId, invocationId, signal())).toEqual({
      ...status,
      stopRequested: true,
    });
    expect(request.mock.calls[1]?.[0]).toBe(
      `https://private-runtime.example/threads/${threadId}/runs/${runId}/cancel?wait=0&action=interrupt`,
    );
    expect(request.mock.calls[2]?.[1]?.method).toBe('GET');
  });

  it.each(['success', 'error', 'interrupted', 'timeout'] as const)(
    'preserves native terminal status %s without another cancellation request',
    async (nativeStatus) => {
      const request = mockFetch().mockResolvedValue(
        Response.json({ ...nativeRun, status: nativeStatus }),
      );
      expect(await client().cancel(executionId, invocationId, signal())).toMatchObject({
        status: nativeStatus,
      });
      expect(request).toHaveBeenCalledOnce();
    },
  );

  it.each([
    { ...nativeRun, status: 'made-up' },
    { ...nativeRun, run_id: 12 },
  ])('rejects invalid native statuses', async (body) => {
    mockFetch().mockResolvedValue(Response.json(body));
    await expect(client().inspect(executionId, invocationId, signal())).rejects.toMatchObject({
      code: 'runtime_response_invalid',
    });
  });

  it('returns only safe HTTP errors without upstream payload or network details', async () => {
    mockFetch()
      .mockResolvedValueOnce(new Response('PRIVATE_MARKER', { status: 410 }))
      .mockResolvedValueOnce(Response.json({ code: 'PRIVATE_MARKER' }, { status: 500 }))
      .mockRejectedValueOnce(new Error('PRIVATE_MARKER'));
    for (const code of ['runtime_replay_expired', 'runtime_unavailable', 'runtime_unavailable']) {
      try {
        await client().inspect(executionId, invocationId, signal());
        expect.fail('must fail');
      } catch (error) {
        expect(error).toBeInstanceOf(RuntimeClientError);
        expect(error).toMatchObject({ code });
        expect(JSON.stringify(error)).not.toContain('PRIVATE_MARKER');
        expect(String(error)).not.toContain('PRIVATE_MARKER');
      }
    }
  });

  it('bounds JSON responses and rejects non-JSON response content', async () => {
    mockFetch()
      .mockResolvedValueOnce(Response.json({ padding: 'a'.repeat(65_536) }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(nativeRun), { headers: { 'Content-Type': 'text/html' } }),
      );
    for (const code of ['runtime_response_limit', 'runtime_response_invalid']) {
      await expect(client().inspect(executionId, invocationId, signal())).rejects.toMatchObject({
        code,
      });
    }
  });

  it('does not start a request after its worker lease has been cancelled', async () => {
    const request = mockFetch();
    const controller = new AbortController();
    controller.abort('PRIVATE_MARKER');
    await expect(
      client().inspect(executionId, invocationId, controller.signal),
    ).rejects.toMatchObject({ code: 'runtime_request_cancelled' });
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects unsafe URLs and malformed Product IDs before dispatch', async () => {
    const request = mockFetch();
    await expect(
      client({ url: 'https://user:secret@runtime.example' }).inspect(
        executionId,
        invocationId,
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'runtime_not_configured' });
    await expect(
      client().dispatch('../raw-runtime-route', invocationId, signal()),
    ).rejects.toMatchObject({ code: 'runtime_identity_invalid' });
    expect(request).not.toHaveBeenCalled();
  });

  it('uses the existing stateless native title contract, with no runtime change', async () => {
    const request = mockFetch().mockResolvedValue(
      Response.json({ title: 'A title', language: 'en' }),
    );
    expect(await client().generateTitle(executionId, invocationId, signal())).toEqual({
      title: 'A title',
      language: 'en',
    });
    expect(request.mock.calls[0]?.[0]).toBe('https://private-runtime.example/runs/wait');
    expect(JSON.parse(requestString(request.mock.calls[0]?.[1]?.body))).toEqual({
      assistant_id: 'title_agent',
      input: { messages: [{ role: 'user', content: 'Persisted user message' }] },
      on_disconnect: 'cancel',
      on_completion: 'delete',
    });
    request.mockClear();
    expect(
      await client({ titleAssistant: '' }).generateTitle(executionId, invocationId, signal()),
    ).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([{}, { title: 'Do not accept an errored title', language: 'en' }])(
    'treats native title error envelopes as unavailable without leaking their details',
    async (extra) => {
      mockFetch().mockResolvedValue(
        Response.json({
          ...extra,
          __error__: { error: 'PRIVATE_MARKER', message: 'PRIVATE_MARKER' },
        }),
      );
      expect(await client().generateTitle(executionId, invocationId, signal())).toBeNull();
    },
  );

  it('bounds a stalled request and cancels its transport', async () => {
    vi.useFakeTimers();
    let transportSignal: AbortSignal | undefined;
    mockFetch().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          transportSignal = options?.signal as AbortSignal;
          transportSignal.addEventListener('abort', () =>
            reject(new Error('private network detail')),
          );
        }),
    );
    const assertion = expect(
      client().inspect(executionId, invocationId, signal()),
    ).rejects.toMatchObject({ code: 'runtime_request_timeout' });
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(transportSignal?.aborted).toBe(true);
  });
});

describe('native resumable event stream', () => {
  it('preserves source IDs and parses fragmented UTF-8, multiline data, comments and CRLF', async () => {
    const request = mockFetch().mockResolvedValue(
      sse(
        ': heartbeat\r',
        '\nid: 0-1\r\nevent: messages\r\ndata: [\r\ndata: {"content":"héllo"}]\r\n\r',
        '\n',
      ),
    );
    expect(await collect(client(), '0-0')).toEqual([
      { id: '0-1', event: 'messages', data: [{ content: 'héllo' }] },
    ]);
    const url = new URL(requestString(request.mock.calls[0]?.[0]));
    expect(url.pathname).toBe(`/threads/${threadId}/runs/${runId}/stream`);
    expect(url.searchParams.get('cancel_on_disconnect')).toBe('false');
    expect(url.searchParams.getAll('stream_mode')).toEqual(['["messages-tuple","updates"]']);
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({
      'Last-Event-ID': '0-0',
      Accept: 'text/event-stream',
    });
  });

  it('preserves native nested event names, source cursors and tuple metadata', async () => {
    mockFetch().mockResolvedValue(
      sse(
        'id: 1810000000000-4\nevent: messages|delegate:uuid|agent:uuid\ndata: [{"type":"AIMessageChunk","id":"message-1","content":"visible"},{"langgraph_node":"agent"}]\n\n',
      ),
    );
    expect(await collect()).toEqual([
      {
        id: '1810000000000-4',
        event: 'messages|delegate:uuid|agent:uuid',
        data: [
          { type: 'AIMessageChunk', id: 'message-1', content: 'visible' },
          { langgraph_node: 'agent' },
        ],
      },
    ]);
  });

  it('starts native replay at -1 without a supplied watermark', async () => {
    const request = mockFetch().mockResolvedValue(sse(': heartbeat\n\n'));
    expect(await collect()).toEqual([]);
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({ 'Last-Event-ID': '-1' });
  });

  it('does not synthesize completion when a valid stream reaches EOF', async () => {
    mockFetch().mockResolvedValue(sse('id: 2-0\nevent: messages\ndata: {"content":"partial"}\n\n'));
    expect(await collect()).toEqual([
      { id: '2-0', event: 'messages', data: { content: 'partial' } },
    ]);
  });

  it.each([
    ['id: 1-0\nevent: messages\ndata: PRIVATE_MARKER\n\n', 'runtime_event_invalid'],
    ['event: messages\ndata: {}\n\n', 'runtime_source_id_missing'],
    [
      'event: error\ndata: {"error":"runtime_stream_interrupted"}\n\n',
      'runtime_stream_interrupted',
    ],
    ['id: 1-0\nevent: messages\ndata: {}', 'runtime_stream_interrupted'],
    [`id: 1-0\ndata: "${'a'.repeat(1_048_576)}"\n\n`, 'runtime_frame_limit'],
  ])(
    'fails closed on malformed or oversized frames without leaking content',
    async (frame, code) => {
      mockFetch().mockResolvedValue(sse(frame));
      await expect(collect()).rejects.toMatchObject({ code });
    },
  );

  it('rejects unsafe source cursor headers before opening a stream', async () => {
    const request = mockFetch();
    await expect(collect(client(), 'source\r\nPRIVATE_MARKER')).rejects.toMatchObject({
      code: 'runtime_cursor_invalid',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('decodes UTF-8 characters split between network bytes', async () => {
    const bytes = new TextEncoder().encode('id: 1-0\nevent: messages\ndata: {"text":"é"}\n\n');
    const split = bytes.indexOf(0xc3) + 1;
    mockFetch().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes.slice(0, split));
            controller.enqueue(bytes.slice(split));
            controller.close();
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    expect(await collect()).toEqual([{ id: '1-0', event: 'messages', data: { text: 'é' } }]);
  });

  it('rejects invalid UTF-8 rather than silently changing event data', async () => {
    mockFetch().mockResolvedValue(
      new Response(new Uint8Array([0xff]), { headers: { 'Content-Type': 'text/event-stream' } }),
    );
    await expect(collect()).rejects.toMatchObject({ code: 'runtime_event_invalid' });
  });

  it('cancels invalid response bodies and propagates safe native replay errors', async () => {
    const cancelled = vi.fn();
    mockFetch()
      .mockResolvedValueOnce(
        new Response(new ReadableStream<Uint8Array>({ cancel: cancelled }), {
          headers: { 'Content-Type': 'text/html' },
        }),
      )
      .mockResolvedValueOnce(Response.json({ code: 'runtime_replay_expired' }, { status: 410 }));
    await expect(collect()).rejects.toMatchObject({ code: 'runtime_response_invalid' });
    expect(cancelled).toHaveBeenCalledOnce();
    await expect(collect()).rejects.toMatchObject({ code: 'runtime_replay_expired' });
  });

  it('releases the reader when its consumer detaches even if peer cancellation never resolves', async () => {
    const cancelled = vi.fn(() => new Promise<void>(() => undefined));
    mockFetch().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('id: 1-0\nevent: messages\ndata: {}\n\n'));
          },
          cancel: cancelled,
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    const iterator = client()
      .join(executionId, invocationId, { after: null, signal: signal() })
      [Symbol.asyncIterator]();
    await iterator.next();
    await iterator.return?.();
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('rearms the idle deadline on heartbeats and releases a stalled stream', async () => {
    vi.useFakeTimers();
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const cancelled = vi.fn();
    mockFetch().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
          },
          cancel: cancelled,
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    const result = collect();
    const assertion = expect(result).rejects.toMatchObject({ code: 'runtime_stream_timeout' });
    await vi.advanceTimersByTimeAsync(80_000);
    streamController?.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
    await vi.advanceTimersByTimeAsync(80_000);
    expect(cancelled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(cancelled).toHaveBeenCalled();
  });
});

describe('the files of a turn at dispatch', () => {
  const withAttachments = (runtimeContent: ReturnType<typeof vi.fn>) =>
    new LangGraphRuntimeClient(
      new ConfigService({
        AGENT_RUNTIME_URL: 'https://private-runtime.example',
        AGENT_RUNTIME_ASSISTANT_ID: 'agent',
      }),
      {
        resolveRuntime: vi.fn().mockResolvedValue({
          execution: {
            id: executionId,
            invocationId,
            runtimeThreadId: threadId,
            runtimeRunId: null,
            bindingGeneration: metadata.alfred_binding_generation,
            dispatchState: 'dispatching',
            stopRequestedAt: null,
          },
          userMessage: 'Persisted user message',
        }),
      } as unknown as ExecutionsService,
      { runtimeContent } as unknown as MessageAttachmentsService,
    );

  it('sends what the attachments service built, read under the dispatch signal', async () => {
    const content = [
      { type: 'text', text: 'Persisted user message' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
    ];
    const runtimeContent = vi.fn().mockResolvedValue(content);
    const request = mockFetch()
      .mockResolvedValueOnce(Response.json({ thread_id: threadId }))
      .mockResolvedValueOnce(Response.json(nativeRun));
    const dispatching = signal();

    await withAttachments(runtimeContent).dispatch(executionId, invocationId, dispatching);

    expect(runtimeContent).toHaveBeenCalledWith(executionId, 'Persisted user message', dispatching);
    expect(JSON.parse(requestString(request.mock.calls[1]?.[1]?.body))).toMatchObject({
      input: { messages: [{ role: 'user', content }] },
    });
  });

  it('says that nothing was dispatched when the files cannot be read, and creates no run', async () => {
    const runtimeContent = vi.fn().mockRejectedValue(new Error('database outage'));
    const request = mockFetch().mockResolvedValueOnce(Response.json({ thread_id: threadId }));

    await expect(
      withAttachments(runtimeContent).dispatch(executionId, invocationId, signal()),
    ).rejects.toMatchObject({ code: RUNTIME_NOT_DISPATCHED });

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toBe('https://private-runtime.example/threads');
  });
});
