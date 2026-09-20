import { createServer, type Server, type RequestListener } from 'node:http';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionsService } from '@api/modules/executions/application/executions.service';
import { LangGraphRuntimeClient } from '@api/modules/executions/infrastructure/langgraph/langgraph-runtime.client';

const executionId = '160c302b-10d5-49cf-81cd-f456f778efea';
const invocationId = '6c858021-63c7-47b1-99d0-7ba67569cd37';
const threadId = '220c302b-10d5-49cf-81cd-f456f778efea';
const runId = '330c302b-10d5-49cf-81cd-f456f778efea';
const bindingGeneration = '440c302b-10d5-49cf-81cd-f456f778efea';
const servers = new Set<Server>();

async function server(handler: RequestListener): Promise<string> {
  const http = createServer(handler);
  servers.add(http);
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(0, '127.0.0.1', resolve);
  });
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Missing local test listener');
  return `http://127.0.0.1:${address.port}`;
}
const client = (url: string, knownRunId: string | null = runId) =>
  new LangGraphRuntimeClient(
    new ConfigService({
      AGENT_RUNTIME_URL: url,
      AGENT_RUNTIME_ASSISTANT_ID: 'agent',
    }),
    {
      resolveRuntime: vi.fn().mockResolvedValue({
        execution: {
          id: executionId,
          invocationId,
          runtimeThreadId: threadId,
          runtimeRunId: knownRunId,
          bindingGeneration,
          dispatchState: 'dispatching',
          stopRequestedAt: null,
        },
        userMessage: 'Persisted message',
      }),
    } as unknown as ExecutionsService,
  );

afterEach(async () => {
  await Promise.all(
    Array.from(
      servers,
      (http) =>
        new Promise<void>((resolve, reject) => {
          http.closeAllConnections();
          http.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  servers.clear();
});

describe('direct native transport over HTTP', () => {
  it('does not follow a redirected native endpoint', async () => {
    const destination = vi.fn<RequestListener>((_request, response) => response.end());
    const redirectUrl = await server(destination);
    const origin = await server((_request, response) => {
      response.writeHead(307, { Location: `${redirectUrl}/capture` });
      response.end();
    });
    await expect(
      client(origin).inspect(executionId, invocationId, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'runtime_unavailable' });
    expect(destination).not.toHaveBeenCalled();
  });

  it('streams immediately with native replay headers and closes the socket on worker cancellation', async () => {
    let socketClosed: Promise<void> | undefined;
    let receivedKey: string | string[] | undefined;
    let receivedCursor: string | string[] | undefined;
    const origin = await server((request, response) => {
      receivedKey = request.headers['x-api-key'];
      receivedCursor = request.headers['last-event-id'];
      socketClosed = new Promise<void>((resolve) => response.once('close', resolve));
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write('id: 170-2\nevent: messages\ndata: {"content":"visible"}\n\n');
    });
    const controller = new AbortController();
    const events = client(origin)
      .join(executionId, invocationId, { after: '170-1', signal: controller.signal })
      [Symbol.asyncIterator]();
    expect(await events.next()).toEqual({
      done: false,
      value: { id: '170-2', event: 'messages', data: { content: 'visible' } },
    });
    expect(receivedKey).toBeUndefined();
    expect(receivedCursor).toBe('170-1');
    controller.abort();
    await expect(events.next()).rejects.toMatchObject({ code: 'runtime_request_cancelled' });
    await socketClosed;
  });
  it('finds a natively accepted run after the creation socket loses its acknowledgement without another POST', async () => {
    let created = 0;
    let accepted: Record<string, unknown> | undefined;
    const origin = await server((request, response) => {
      expect(request.headers.authorization).toBeUndefined();
      expect(request.headers['x-api-key']).toBeUndefined();
      if (request.url === '/threads' && request.method === 'POST') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ thread_id: threadId }));
      } else if (request.url === `/threads/${threadId}/runs` && request.method === 'POST') {
        created += 1;
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          const body = JSON.parse(Buffer.concat(chunks).toString()) as { metadata: unknown };
          accepted = {
            thread_id: threadId,
            run_id: runId,
            status: 'running',
            metadata: body.metadata,
          };
          request.socket.destroy();
        });
      } else if (
        request.url === `/threads/${threadId}/runs?limit=20&offset=0` &&
        request.method === 'GET'
      ) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify([accepted]));
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    const runtime = client(origin, null);
    await expect(
      runtime.dispatch(executionId, invocationId, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'runtime_unavailable' });
    expect(
      await runtime.inspect(executionId, invocationId, new AbortController().signal),
    ).toMatchObject({ runId, status: 'running' });
    expect(created).toBe(1);
  });
});
