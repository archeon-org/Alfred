import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createExecution,
  getActiveExecution,
  getExecution,
  listMessages,
  observeExecution,
  stopExecution,
} from '@/services/executions/executions.service';
import type { HttpClient } from '@/services/http/http-client';
import { EXECUTION_ID, SUBMISSION_ID, snapshot } from '../../../support/executions-api';
import { CONVERSATION_ID, STANDALONE_CONVERSATION_ID } from '../../../support/workspace-api';

const commands = [
  [
    'create',
    (client: HttpClient, signal: AbortSignal) =>
      createExecution(client, CONVERSATION_ID, 'First', SUBMISSION_ID, signal),
  ],
  [
    'discover',
    (client: HttpClient, signal: AbortSignal) =>
      getActiveExecution(client, CONVERSATION_ID, signal),
  ],
  [
    'reconcile',
    (client: HttpClient, signal: AbortSignal) => getExecution(client, EXECUTION_ID, signal),
  ],
  [
    'stop',
    (client: HttpClient, signal: AbortSignal) => stopExecution(client, EXECUTION_ID, signal),
  ],
] as const;

function stalledClient() {
  let signal: AbortSignal | null | undefined;
  const client: HttpClient = {
    request: vi.fn<HttpClient['request']>((_path, init) => {
      signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(new DOMException('Request detached', 'AbortError'));
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
      });
    }),
  };
  return { client, signal: () => signal };
}

function streamingClient() {
  let body!: ReadableStreamDefaultController<Uint8Array>;
  let signal: AbortSignal | null | undefined;
  const cancel = vi.fn();
  const client: HttpClient = {
    request: vi.fn<HttpClient['request']>((_path, init) => {
      signal = init?.signal;
      const response = new ReadableStream<Uint8Array>({
        start(controller) {
          body = controller;
          signal?.addEventListener('abort', () => controller.error(signal?.reason), { once: true });
        },
        cancel,
      });
      return Promise.resolve(
        new Response(response, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } }),
      );
    }),
  };
  return {
    client,
    cancel,
    signal: () => signal,
    write: (text: string) => body.enqueue(new TextEncoder().encode(text)),
  };
}

afterEach(() => vi.useRealTimers());

describe('execution transport boundary regressions', () => {
  it.each(commands)(
    'rejects a %s acknowledgement containing another conversation',
    async (_name, command) => {
      const foreign = snapshot({
        execution: { ...snapshot().execution, conversationId: STANDALONE_CONVERSATION_ID },
        // Keep the requested conversation in the envelope to detect inconsistent identity fields too.
      });
      const request = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: true, data: { snapshot: foreign } })),
        );
      await expect(command({ request }, new AbortController().signal)).rejects.toThrow('invalide');
      expect(request).toHaveBeenCalledOnce();
    },
  );

  it('rejects a transcript containing a valid message belonging to another conversation', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            items: [
              {
                id: '44444444-4444-4444-8444-444444444444',
                executionId: EXECUTION_ID,
                conversationId: STANDALONE_CONVERSATION_ID,
                role: 'assistant',
                content: 'Other conversation content',
                createdAt: '2026-09-11T09:00:00.000Z',
              },
            ],
          },
        }),
      ),
    );
    await expect(listMessages({ request }, CONVERSATION_ID)).rejects.toThrow('invalide');
  });

  it.each(commands)(
    'bounds a stalled %s request and releases its timeout after failure',
    async (_name, command) => {
      vi.useFakeTimers();
      const request = stalledClient();
      const pending = command(request.client, new AbortController().signal);
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await vi.advanceTimersByTimeAsync(19_999);
      expect(request.signal()?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      expect(request.signal()?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      expect(request.client.request).toHaveBeenCalledOnce();
    },
  );

  it.each(commands)(
    'cancels an outstanding %s request immediately when its account detaches',
    async (_name, command) => {
      vi.useFakeTimers();
      const account = new AbortController();
      const request = stalledClient();
      const pending = command(request.client, account.signal);
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      account.abort();
      await rejected;
      expect(request.signal()?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('times out an observer that never receives HTTP headers without retrying a mutation', async () => {
    vi.useFakeTimers();
    const request = stalledClient();
    const observer = observeExecution(request.client, EXECUTION_ID, new AbortController().signal);
    const rejected = expect(observer.next()).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    expect(request.client.request).toHaveBeenCalledExactlyOnceWith(
      `/executions/${EXECUTION_ID}/events`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('survives four minutes of heartbeat-only traffic and resumes cumulative text without opening another request', async () => {
    vi.useFakeTimers();
    const request = streamingClient();
    const observer = observeExecution(
      request.client,
      EXECUTION_ID,
      new AbortController().signal,
      'before-silence',
    );
    const pending = observer.next();
    await vi.advanceTimersByTimeAsync(0);
    for (let elapsed = 0; elapsed < 240_000; elapsed += 20_000) {
      await vi.advanceTimersByTimeAsync(20_000);
      request.write(': heartbeat\n\n');
      await vi.advanceTimersByTimeAsync(0);
      expect(request.signal()?.aborted).toBe(false);
    }
    const runStarted = { type: 'RUN_STARTED', threadId: CONVERSATION_ID, runId: EXECUTION_ID };
    request.write(`id: after-silence\ndata: ${JSON.stringify(runStarted)}\n\n`);
    await expect(pending).resolves.toEqual({
      done: false,
      value: { event: runStarted, id: 'after-silence' },
    });
    expect(request.client.request).toHaveBeenCalledOnce();
    await observer.return(undefined);
    expect(request.cancel).toHaveBeenCalledOnce();
    expect(request.signal()?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts the silence deadline on a heartbeat, then releases a truly stalled observer', async () => {
    vi.useFakeTimers();
    const request = streamingClient();
    const observer = observeExecution(request.client, EXECUTION_ID, new AbortController().signal);
    const rejected = expect(observer.next()).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(50_000);
    request.write(': keepalive\n\n');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(request.signal()?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(request.signal()?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
