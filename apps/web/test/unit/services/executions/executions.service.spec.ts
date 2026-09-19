import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  listMessages,
  createExecution,
  observeExecution,
  getActiveExecution,
  getExecution,
  stopExecution,
} from '@/services/executions/executions.service';
import { InvalidStreamError } from '@/services/executions/sse';
import { createHttpClient } from '@/services/http/http-client';
import { CONVERSATION_ID } from '../../../support/workspace-api';

afterEach(() => vi.unstubAllGlobals());

const MESSAGE_ID = '11111111-1111-4111-8111-111111111111';
import { EXECUTION_ID, SUBMISSION_ID, snapshot } from '../../../support/executions-api';

function sseResponse(text: string): Response {
  return new Response(new TextEncoder().encode(text), {
    headers: { 'content-type': 'text/event-stream' },
    status: 200,
  });
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe('listMessages', () => {
  it('reads the stored transcript with the authenticated client', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            items: [
              {
                content: 'Salut',
                conversationId: CONVERSATION_ID,
                createdAt: '2026-09-11T09:00:00.000Z',
                executionId: EXECUTION_ID,
                id: MESSAGE_ID,
                role: 'user',
              },
            ],
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const messages = await listMessages(
      createHttpClient({ getAccessToken: () => 'token' }),
      CONVERSATION_ID,
    );
    expect(messages).toEqual([expect.objectContaining({ content: 'Salut', role: 'user' })]);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/conversations/${CONVERSATION_ID}/messages`);
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer token');
  });

  it('rejects an invalid transcript envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: true, data: { items: [{ id: 'nope' }] } })),
        ),
    );
    await expect(listMessages(createHttpClient(), CONVERSATION_ID)).rejects.toThrow(
      'La liste des messages est invalide.',
    );
  });
});

describe('execution commands and observation', () => {
  it('creates with a stable submission identity and reads the accepted snapshot', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { snapshot: snapshot() } })),
      );
    vi.stubGlobal('fetch', fetch);
    expect(
      await createExecution(
        createHttpClient(),
        CONVERSATION_ID,
        'Salut',
        SUBMISSION_ID,
        new AbortController().signal,
      ),
    ).toEqual(snapshot());
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/conversations/${CONVERSATION_ID}/executions`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      message: 'Salut',
      submissionId: SUBMISSION_ID,
    });
    expect(new Headers(init.headers).get('accept')).toBe(
      'application/vnd.alfred.execution+json;version=1',
    );
  });

  it('observes by execution id and cursor without posting the original prompt', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        sseResponse(`id: cursor:0\nevent: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`),
      );
    vi.stubGlobal('fetch', fetch);
    const events = await collect(
      observeExecution(
        createHttpClient({ getAccessToken: () => 'token' }),
        EXECUTION_ID,
        new AbortController().signal,
        'old-cursor',
      ),
    );
    expect(events).toEqual([{ event: 'snapshot', data: snapshot(), id: 'cursor:0' }]);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/executions/${EXECUTION_ID}/events`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).get('last-event-id')).toBe('old-cursor');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer token');
  });

  it('parses delta frames for the observed execution and rejects a foreign or mismatched one', async () => {
    const delta = {
      executionId: EXECUTION_ID,
      baseRevision: 0,
      revision: 1,
      cursor: 'cursor:1',
      assistantAppend: 'Salut',
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse(
            `id: cursor:0\nevent: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n` +
              `id: cursor:1\nevent: delta\ndata: ${JSON.stringify(delta)}\n\n`,
          ),
        ),
    );
    const events = await collect(
      observeExecution(createHttpClient(), EXECUTION_ID, new AbortController().signal),
    );
    expect(events).toEqual([
      { event: 'snapshot', data: snapshot(), id: 'cursor:0' },
      { event: 'delta', data: delta, id: 'cursor:1' },
    ]);
    for (const bad of [
      { ...delta, executionId: '11111111-1111-4111-8111-111111111111' },
      { ...delta, cursor: 'other' },
    ]) {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            sseResponse(`id: cursor:1\nevent: delta\ndata: ${JSON.stringify(bad)}\n\n`),
          ),
      );
      await expect(
        collect(observeExecution(createHttpClient(), EXECUTION_ID, new AbortController().signal)),
      ).rejects.toBeInstanceOf(InvalidStreamError);
    }
  });

  it('discovers existing work, reads its status and requests Stop through JSON endpoints', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true, data: { snapshot: snapshot() } })),
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const client = createHttpClient();
    await expect(getActiveExecution(client, CONVERSATION_ID)).resolves.toEqual(snapshot());
    await expect(getExecution(client, EXECUTION_ID)).resolves.toEqual(snapshot());
    await expect(
      stopExecution(client, EXECUTION_ID, new AbortController().signal),
    ).resolves.toEqual(snapshot());
    expect(
      (fetch.mock.calls as [string, RequestInit][]).map(([url, init]) => [url, init.method]),
    ).toEqual([
      [expect.stringContaining(`/conversations/${CONVERSATION_ID}/executions/active`), 'GET'],
      [expect.stringContaining(`/executions/${EXECUTION_ID}`), 'GET'],
      [expect.stringContaining(`/executions/${EXECUTION_ID}/stop`), 'POST'],
    ]);
  });

  it.each(['metadata', 'messages/partial', 'custom', 'error'])(
    'rejects unsupported raw runtime %s events before diagnostics',
    async (name) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(sseResponse(`event: ${name}\ndata: {"secret":"private"}\n\n`)),
      );
      await expect(
        collect(observeExecution(createHttpClient(), EXECUTION_ID, new AbortController().signal)),
      ).rejects.toThrow('invalide');
    },
  );

  it('rejects a mismatched execution, forged cursor and malformed snapshot', async () => {
    for (const data of [
      snapshot({ execution: { ...snapshot().execution, id: CONVERSATION_ID } }),
      { nope: true },
      snapshot({ cursor: 'different' }),
    ]) {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            sseResponse(`id: cursor:0\nevent: snapshot\ndata: ${JSON.stringify(data)}\n\n`),
          ),
      );
      await expect(
        collect(observeExecution(createHttpClient(), EXECUTION_ID, new AbortController().signal)),
      ).rejects.toThrow('invalide');
    }
  });

  it('turns the allowlisted transient observer error into a retryable failure without exposing payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse('event: error\ndata: {"code":"execution_stream_unavailable"}\n\n'),
        ),
    );
    await expect(
      collect(observeExecution(createHttpClient(), EXECUTION_ID, new AbortController().signal)),
    ).rejects.toMatchObject({ code: 'execution_stream_unavailable', status: 503 });
  });

  it('surfaces stable business errors and never treats JSON as a stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ success: false, error: { code: 'thread_busy', message: 'Busy' } }),
            { status: 409 },
          ),
        ),
    );
    await expect(
      createExecution(
        createHttpClient(),
        CONVERSATION_ID,
        'Encore',
        SUBMISSION_ID,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'thread_busy', status: 409 });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json' } })),
    );
    await expect(
      collect(observeExecution(createHttpClient(), EXECUTION_ID, new AbortController().signal)),
    ).rejects.toThrow('invalide');
  });
});
