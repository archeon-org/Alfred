import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  AgUiReplicaBuilder,
  parseAgUiFrame,
  type ObservedReplica,
} from '../../../support/ag-ui-frames';

type Frame = { id: string; data: unknown };
type FixtureRun = {
  run_id: string;
  thread_id: string;
  assistant_id: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  frames: Frame[];
  clients: Set<ServerResponse>;
};

/** Multiple deterministic native runs, with independently controlled progress and network faults. */
export class NativeMultichatFixture {
  readonly runs = new Map<string, FixtureRun>();
  readonly creates: { executionId: string; threadId: string; at: number }[] = [];
  readonly joins: { executionId: string; after: string | undefined; at: number }[] = [];
  readonly cancels: string[] = [];
  maxConcurrentStreams = 0;
  url = '';
  private readonly server = createServer((request, response) => {
    void this.route(request, response).catch(() => {
      response.statusCode = 500;
      response.end();
    });
  });

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async close(): Promise<void> {
    for (const run of this.runs.values()) this.disconnect(run);
    this.server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  run(executionId: string): FixtureRun {
    const result = this.runs.get(executionId);
    if (!result) throw new Error('Native fixture run has not been dispatched');
    return result;
  }

  emit(executionId: string, content: string): string {
    const run = this.run(executionId);
    const frame = {
      id: `${new Date(run.created_at).getTime()}-${run.frames.length}`,
      data: [
        { id: `answer-${executionId}`, type: 'AIMessageChunk', content },
        { langgraph_node: 'assistant' },
      ],
    };
    run.frames.push(frame);
    for (const client of run.clients) this.write(client, frame);
    return frame.id;
  }

  complete(executionId: string): void {
    const run = this.run(executionId);
    run.status = 'success';
    for (const client of run.clients) client.end();
  }

  dropStream(executionId: string): void {
    this.disconnect(this.run(executionId));
  }

  private disconnect(run: FixtureRun): void {
    for (const client of run.clients) client.destroy();
    run.clients.clear();
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', this.url);
    const method = request.method ?? 'GET';
    if (method === 'POST' && url.pathname === '/threads') {
      const input = await this.body(request);
      this.json(response, { thread_id: input.thread_id });
      return;
    }
    const match = /^\/threads\/([^/]+)\/runs(?:\/([^/]+))?(?:\/(stream|cancel))?$/.exec(
      url.pathname,
    );
    if (!match) {
      response.statusCode = 404;
      this.json(response, { detail: 'Unknown fixture route' });
      return;
    }
    const [, threadId, runId, operation] = match;
    if (method === 'POST' && !runId) {
      const input = await this.body(request);
      const metadata = input.metadata as Record<string, unknown>;
      const executionId = String(metadata.alfred_execution_id);
      const at = Date.now();
      const run: FixtureRun = {
        run_id: randomUUID(),
        thread_id: threadId!,
        assistant_id: 'fixture',
        status: 'running',
        metadata,
        created_at: new Date(at).toISOString(),
        updated_at: new Date(at).toISOString(),
        frames: [],
        clients: new Set(),
      };
      this.creates.push({ executionId, threadId: threadId!, at });
      this.runs.set(executionId, run);
      this.json(response, this.wireRun(run));
      return;
    }
    const candidates = [...this.runs.values()].filter((run) => run.thread_id === threadId);
    if (method === 'GET' && !runId) {
      this.json(
        response,
        candidates.map((run) => this.wireRun(run)),
      );
      return;
    }
    const run = candidates.find((candidate) => candidate.run_id === runId);
    if (!run) {
      response.statusCode = 404;
      this.json(response, { detail: 'Unknown fixture run' });
      return;
    }
    if (method === 'GET' && operation === 'stream') {
      this.join(request, response, run);
      return;
    }
    if (method === 'POST' && operation === 'cancel') {
      this.cancels.push(String(run.metadata.alfred_execution_id));
      run.status = 'interrupted';
      for (const client of run.clients) client.end();
      response.statusCode = 202;
      response.end();
      return;
    }
    this.json(response, this.wireRun(run));
  }

  private join(request: IncomingMessage, response: ServerResponse, run: FixtureRun): void {
    const header = request.headers['last-event-id'];
    const after = typeof header === 'string' ? header : undefined;
    const index =
      after === undefined || after === '-1' ? -1 : run.frames.findIndex((f) => f.id === after);
    if (after !== undefined && after !== '-1' && index === -1) {
      response.statusCode = 410;
      this.json(response, { detail: 'Unknown replay position' });
      return;
    }
    this.joins.push({
      executionId: String(run.metadata.alfred_execution_id),
      after,
      at: Date.now(),
    });
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write(': native heartbeat\n\n');
    for (const frame of run.frames.slice(index + 1)) this.write(response, frame);
    if (run.status !== 'running') {
      response.end();
      return;
    }
    run.clients.add(response);
    this.maxConcurrentStreams = Math.max(
      this.maxConcurrentStreams,
      [...this.runs.values()].reduce((total, candidate) => total + candidate.clients.size, 0),
    );
    const heartbeat = setInterval(() => response.write(': native heartbeat\n\n'), 1_000);
    response.on('close', () => {
      clearInterval(heartbeat);
      run.clients.delete(response);
    });
  }

  private wireRun(run: FixtureRun) {
    return {
      run_id: run.run_id,
      thread_id: run.thread_id,
      assistant_id: run.assistant_id,
      status: run.status,
      metadata: run.metadata,
      created_at: run.created_at,
      updated_at: run.updated_at,
    };
  }

  private write(response: ServerResponse, frame: Frame): void {
    response.write(`id: ${frame.id}\nevent: messages\ndata: ${JSON.stringify(frame.data)}\n\n`);
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

/** Real browser-like HTTP reader, including heartbeats, independent abort and resume cursor. */
export class MultichatSnapshotReader {
  readonly snapshots: ObservedReplica[] = [];
  readonly errors: unknown[] = [];
  private readonly replica = new AgUiReplicaBuilder();
  maxByteGapMs = 0;
  done: Promise<void> = Promise.resolve();
  private readonly controller = new AbortController();

  async start(url: string, token: string, cursor?: string): Promise<void> {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'text/event-stream',
        ...(cursor === undefined ? {} : { 'last-event-id': cursor }),
      },
      signal: this.controller.signal,
    });
    if (response.status !== 200) throw new Error(`SSE response ${response.status}`);
    this.done = this.read(response).catch((error: unknown) => {
      if (!this.controller.signal.aborted) this.errors.push(error);
    });
  }

  abort(): void {
    this.controller.abort();
  }

  private async read(response: Response): Promise<void> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let lastByteAt = Date.now();
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) return;
        const now = Date.now();
        this.maxByteGapMs = Math.max(this.maxByteGapMs, now - lastByteAt);
        lastByteAt = now;
        text += decoder.decode(chunk.value, { stream: true });
        let boundary: number;
        while ((boundary = text.indexOf('\n\n')) !== -1) {
          const frame = parseAgUiFrame(text.slice(0, boundary));
          text = text.slice(boundary + 2);
          if (frame?.kind === 'error') this.errors.push(frame.data);
          else if (frame?.kind === 'agui') this.snapshots.push(this.replica.push(frame)!);
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}
