import { afterEach, describe, expect, it, vi } from 'vitest';

import { listMessages, streamExecution } from '@/services/executions/executions.service';
import { createHttpClient } from '@/services/http/http-client';
import { CONVERSATION_ID } from '../../../support/workspace-api';

afterEach(() => vi.unstubAllGlobals());

const MESSAGE_ID = '11111111-1111-4111-8111-111111111111';
const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';

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

describe('streamExecution', () => {
  it('posts the message and yields the relayed events in order', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        sseResponse(
          'event: execution\ndata: {"status":"running"}\n\nevent: updates\ndata: {"agent":{}}\n\n',
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const events = await collect(
      streamExecution(
        createHttpClient({ getAccessToken: () => 'token' }),
        CONVERSATION_ID,
        'Bonjour',
        new AbortController().signal,
      ),
    );
    expect(events).toEqual([
      { data: { status: 'running' }, event: 'execution' },
      { data: { agent: {} }, event: 'updates' },
    ]);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/conversations/${CONVERSATION_ID}/executions`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ message: 'Bonjour' }));
    expect(new Headers(init.headers).get('accept')).toBe('text/event-stream');
  });

  it('surfaces the API business error before streaming', async () => {
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
      collect(
        streamExecution(
          createHttpClient(),
          CONVERSATION_ID,
          'Encore',
          new AbortController().signal,
        ),
      ),
    ).rejects.toMatchObject({ code: 'thread_busy', status: 409 });
  });
});
