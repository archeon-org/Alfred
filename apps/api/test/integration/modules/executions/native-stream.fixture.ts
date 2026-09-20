import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Deterministic HTTP protocol fixture, not a LangGraph server or provider qualification. */
export class NativeStreamFixture {
  readonly runId = randomUUID();
  readonly frames: { id: string; data: unknown; createdAt: number }[] = [];
  readonly joins: { after: string | undefined; atMs: number }[] = [];
  readonly requests: { method: string; path: string }[] = [];
  readonly streamModes: unknown[] = [];
  startedAt = 0;
  creates = 0;
  cancelled = 0;
  status = 'pending';
  threadId = '';
  metadata: Record<string, unknown> = {};
  url = '';
  private readonly clients = new Set<ServerResponse>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly server = createServer((request, response) => {
    void this.route(request, response).catch(() => {
      response.statusCode = 500;
      response.end();
    });
  });

  constructor(readonly durationMs: number) {}

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async close(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer);
    for (const client of this.clients) client.destroy();
    this.server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  private run() {
    return {
      run_id: this.runId,
      thread_id: this.threadId,
      assistant_id: 'fixture',
      status: this.status,
      metadata: this.metadata,
      created_at: new Date(this.startedAt).toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', this.url);
    const method = request.method ?? 'GET';
    this.requests.push({ method, path: url.pathname });
    if (method === 'POST' && url.pathname === '/threads') {
      const input = await this.body(request);
      this.threadId = String(input.thread_id);
      this.json(response, { thread_id: this.threadId });
      return;
    }
    const prefix = `/threads/${this.threadId}/runs`;
    if (method === 'POST' && url.pathname === prefix) {
      const input = await this.body(request);
      this.creates += 1;
      this.metadata = input.metadata as Record<string, unknown>;
      this.streamModes.push(input.stream_mode);
      this.startedAt = Date.now();
      this.status = 'running';
      this.emit('A durable');
      this.schedule(() => this.emit(' streaming'), this.durationMs / 2);
      this.schedule(() => {
        this.emit(' answer.');
        this.status = 'success';
        for (const client of this.clients) client.end();
      }, this.durationMs);
      // Native accepted once; Product must discover it instead of retrying POST after this loss.
      response.destroy();
      return;
    }
    if (method === 'GET' && url.pathname === prefix) {
      this.json(response, this.startedAt ? [this.run()] : []);
      return;
    }
    if (method === 'GET' && url.pathname === `${prefix}/${this.runId}`) {
      this.json(response, this.run());
      return;
    }
    if (method === 'GET' && url.pathname === `${prefix}/${this.runId}/stream`) {
      this.streamModes.push(url.searchParams.get('stream_mode'));
      this.join(request, response);
      return;
    }
    if (method === 'POST' && url.pathname === `${prefix}/${this.runId}/cancel`) {
      this.cancelled += 1;
      response.end();
      return;
    }
    response.statusCode = 404;
    this.json(response, { detail: 'Not found' });
  }

  private join(request: IncomingMessage, response: ServerResponse): void {
    const header = request.headers['last-event-id'];
    const after = typeof header === 'string' ? header : undefined;
    this.joins.push({ after, atMs: Date.now() - this.startedAt });
    const replayTtlMs = Math.min(120_000, this.durationMs / 2);
    const available = this.frames.filter((frame) => Date.now() - frame.createdAt < replayTtlMs);
    if (after !== undefined && after !== '-1' && !available.some((frame) => frame.id === after)) {
      response.statusCode = 410;
      this.json(response, { detail: 'Replay position expired' });
      return;
    }
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    response.flushHeaders();
    response.write(': native heartbeat\n\n');
    const anchor =
      after === undefined || after === '-1' ? -1 : this.frames.findIndex((f) => f.id === after);
    if (anchor === -1 && after !== undefined && after !== '-1') {
      response.destroy();
      return;
    }
    for (const frame of this.frames.slice(anchor + 1)) this.write(response, frame);
    if (this.status === 'success') {
      response.end();
      return;
    }
    this.clients.add(response);
    const heartbeat = setInterval(() => response.write(': native heartbeat\n\n'), 10_000);
    response.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(response);
    });
  }

  private emit(content: string): void {
    const frame = {
      id: `${this.startedAt}-${this.frames.length}`,
      createdAt: Date.now(),
      data: [{ id: 'answer', type: 'AIMessageChunk', content }, { langgraph_node: 'assistant' }],
    };
    this.frames.push(frame);
    for (const client of this.clients) this.write(client, frame);
  }

  private write(response: ServerResponse, frame: { id: string; data: unknown }): void {
    response.write(`id: ${frame.id}\nevent: messages\ndata: ${JSON.stringify(frame.data)}\n\n`);
  }

  private schedule(callback: () => void, duration: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, duration);
    this.timers.add(timer);
  }

  private async body(request: IncomingMessage): Promise<Record<string, unknown>> {
    let content = '';
    for await (const part of request) content += String(part);
    return JSON.parse(content) as Record<string, unknown>;
  }

  private json(response: ServerResponse, value: unknown): void {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(value));
  }
}
