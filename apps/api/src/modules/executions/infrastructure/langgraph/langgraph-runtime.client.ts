import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { ExecutionsService } from '../../application/executions.service';
import {
  RuntimeClientError,
  type GeneratedTitle,
  type RuntimeClient,
  type RuntimeEvent,
  type RuntimeRun,
} from '../../application/runtime-client.port';
import { readRuntimeEvents, validateNativePosition } from './runtime-event-stream';
import {
  assertRuntimeSuccess,
  readRuntimeJson,
  RuntimeRequestBudget,
} from './runtime-http.transport';

const STREAM_MODES = ['messages-tuple', 'updates'];
const LIST_PAGE_SIZE = 20;
const LIST_MAX_PAGES = 5;
const TITLE_TIMEOUT_MS = 12_000;
const nativeRunSchema = z.object({
  thread_id: z.uuid(),
  run_id: z.uuid(),
  status: z.enum(['pending', 'running', 'success', 'error', 'interrupted', 'timeout']),
  metadata: z.record(z.string(), z.unknown()),
});
type NativeRun = z.infer<typeof nativeRunSchema>;
type Context = Awaited<ReturnType<ExecutionsService['resolveRuntime']>>;

/** Uses the existing native API. Browser credentials never enter this connection. */
@Injectable()
export class LangGraphRuntimeClient implements RuntimeClient {
  constructor(
    private readonly config: ConfigService,
    private readonly executions: ExecutionsService,
  ) {}

  async dispatch(
    executionId: string,
    invocationId: string,
    signal: AbortSignal,
  ): Promise<RuntimeRun> {
    const context = await this.context(executionId, invocationId, signal);
    const row = context.execution;
    if (
      row.runtimeRunId !== null ||
      row.dispatchState === 'unknown' ||
      row.dispatchState === 'accepted'
    ) {
      return this.inspectContext(context, signal);
    }
    const thread = await this.jsonRequest('/threads', 'POST', signal, {
      thread_id: row.runtimeThreadId,
      if_exists: 'do_nothing',
    });
    if (!z.object({ thread_id: z.literal(row.runtimeThreadId) }).safeParse(thread).success) {
      throw new RuntimeClientError('runtime_identity_mismatch');
    }
    const assistantId = this.config.get<string>('AGENT_RUNTIME_ASSISTANT_ID');
    if (!assistantId) throw new RuntimeClientError('runtime_not_configured');
    // A background run survives this HTTP response/connection. on_disconnect belongs only to
    // native streaming/wait creation, and is deliberately absent from this native schema.
    const body = await this.jsonRequest(`${this.threadPath(context)}/runs`, 'POST', signal, {
      assistant_id: assistantId,
      input: { messages: [{ role: 'user', content: context.userMessage }] },
      metadata: this.metadata(context),
      stream_mode: STREAM_MODES,
      stream_subgraphs: true,
      stream_resumable: true,
      // Product already settled any predecessor (Stop, deadline or supersede); the native server
      // interrupts a lingering run on this thread atomically before the replacement starts.
      multitask_strategy: 'interrupt',
    });
    return this.present(this.parseRun(body, context), context);
  }

  async inspect(
    executionId: string,
    invocationId: string,
    signal: AbortSignal,
  ): Promise<RuntimeRun> {
    return this.inspectContext(await this.context(executionId, invocationId, signal), signal);
  }

  async cancel(
    executionId: string,
    invocationId: string,
    signal: AbortSignal,
  ): Promise<RuntimeRun> {
    const context = await this.context(executionId, invocationId, signal);
    const run = await this.inspectContext(context, signal);
    if (run.runId === null || !['running', 'pending'].includes(run.status)) return run;
    await this.jsonRequest(
      `${this.threadPath(context)}/runs/${run.runId}/cancel?wait=0&action=interrupt`,
      'POST',
      signal,
      undefined,
      { empty: true },
    );
    // Native 202 acknowledges the request, not a terminal state. Completion remains authoritative.
    const body = await this.jsonRequest(
      `${this.threadPath(context)}/runs/${run.runId}`,
      'GET',
      signal,
    );
    return {
      ...this.present(this.parseRun(body, context, run.runId), context),
      stopRequested: true,
    };
  }

  async generateTitle(
    executionId: string,
    invocationId: string,
    signal: AbortSignal,
  ): Promise<GeneratedTitle | null> {
    const context = await this.context(executionId, invocationId, signal);
    const assistantId = this.config.get<string>('AGENT_RUNTIME_TITLE_ASSISTANT_ID') ?? '';
    if (!assistantId) return null;
    const body = await this.jsonRequest(
      '/runs/wait',
      'POST',
      signal,
      {
        assistant_id: assistantId,
        input: { messages: [{ role: 'user', content: context.userMessage }] },
        on_disconnect: 'cancel',
        on_completion: 'delete',
      },
      { timeoutMs: TITLE_TIMEOUT_MS },
    );
    if (typeof body === 'object' && body !== null && '__error__' in body) return null;
    const parsed = z
      .object({
        title: z.string().trim().min(1).max(240),
        language: z.string().max(64).nullish(),
      })
      .safeParse(body);
    return parsed.success
      ? { title: parsed.data.title, language: parsed.data.language ?? null }
      : null;
  }

  async *join(
    executionId: string,
    invocationId: string,
    options: { readonly after: string | null; readonly signal: AbortSignal },
  ): AsyncIterable<RuntimeEvent> {
    const after = options.after ?? '-1';
    validateNativePosition(after);
    const context = await this.context(executionId, invocationId, options.signal);
    const runId =
      context.execution.runtimeRunId ?? (await this.inspectContext(context, options.signal)).runId;
    if (runId === null) throw new RuntimeClientError('runtime_dispatch_unresolved');
    const query = new URLSearchParams({
      cancel_on_disconnect: 'false',
      stream_mode: JSON.stringify(STREAM_MODES),
    });
    const budget = new RuntimeRequestBudget(options.signal);
    try {
      const response = await this.request(
        `${this.threadPath(context)}/runs/${runId}/stream?${query}`,
        'GET',
        budget,
        undefined,
        {
          Accept: 'text/event-stream',
          'Last-Event-ID': after,
        },
      );
      assertRuntimeSuccess(response);
      yield* readRuntimeEvents(response, budget);
    } catch (error) {
      throw budget.safeError(error);
    } finally {
      budget.close();
    }
  }

  private async context(
    executionId: string,
    invocationId: string,
    signal: AbortSignal,
  ): Promise<Context> {
    if (!z.uuid().safeParse(executionId).success || !z.uuid().safeParse(invocationId).success) {
      throw new RuntimeClientError('runtime_identity_invalid');
    }
    if (signal.aborted) throw new RuntimeClientError('runtime_request_cancelled');
    const context = await this.executions.resolveRuntime(executionId, invocationId);
    if (
      !z.uuid().safeParse(context.execution.runtimeThreadId).success ||
      (context.execution.runtimeRunId !== null &&
        !z.uuid().safeParse(context.execution.runtimeRunId).success)
    ) {
      throw new RuntimeClientError('runtime_identity_invalid');
    }
    if (signal.aborted) throw new RuntimeClientError('runtime_request_cancelled');
    return context;
  }

  private async inspectContext(context: Context, signal: AbortSignal): Promise<RuntimeRun> {
    const knownRunId = context.execution.runtimeRunId;
    if (knownRunId !== null) {
      const body = await this.jsonRequest(
        `${this.threadPath(context)}/runs/${knownRunId}`,
        'GET',
        signal,
      );
      return this.present(this.parseRun(body, context, knownRunId), context);
    }
    const matches = new Map<string, NativeRun>();
    for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
      const body = await this.jsonRequest(
        `${this.threadPath(context)}/runs?limit=${LIST_PAGE_SIZE}&offset=${page * LIST_PAGE_SIZE}`,
        'GET',
        signal,
        undefined,
        { missing: true },
      );
      // An absent thread/list does not prove the original dispatch never reached the server.
      if (body === null) break;
      const parsed = z.array(nativeRunSchema).max(LIST_PAGE_SIZE).safeParse(body);
      if (!parsed.success) throw new RuntimeClientError('runtime_response_invalid');
      for (const candidate of parsed.data) {
        if (candidate.metadata.alfred_invocation_id !== context.execution.invocationId) continue;
        const run = this.parseRun(candidate, context);
        matches.set(run.run_id, run);
      }
      if (matches.size > 1) throw new RuntimeClientError('runtime_invocation_conflict');
      if (parsed.data.length < LIST_PAGE_SIZE) break;
    }
    const match = matches.values().next().value;
    return match
      ? this.present(match, context)
      : {
          executionId: context.execution.id,
          invocationId: context.execution.invocationId,
          threadId: context.execution.runtimeThreadId!,
          runId: null,
          status: 'unresolved',
          stopRequested: context.execution.stopRequestedAt !== null,
          replayAvailable: false,
        };
  }

  private parseRun(body: unknown, context: Context, runId?: string): NativeRun {
    const parsed = nativeRunSchema.safeParse(body);
    if (!parsed.success) throw new RuntimeClientError('runtime_response_invalid');
    const run = parsed.data;
    if (
      run.thread_id !== context.execution.runtimeThreadId ||
      (runId !== undefined && run.run_id !== runId) ||
      Object.entries(this.metadata(context)).some(([key, value]) => run.metadata[key] !== value)
    ) {
      throw new RuntimeClientError('runtime_identity_mismatch');
    }
    return run;
  }

  private present(run: NativeRun, context: Context): RuntimeRun {
    return {
      executionId: context.execution.id,
      invocationId: context.execution.invocationId,
      threadId: run.thread_id,
      runId: run.run_id,
      status: run.status,
      stopRequested: context.execution.stopRequestedAt !== null,
      // Eligibility only: native GET stream remains authoritative about retention availability.
      replayAvailable: true,
    };
  }

  private metadata(context: Context) {
    return {
      alfred_execution_id: context.execution.id,
      alfred_invocation_id: context.execution.invocationId,
      alfred_binding_generation: context.execution.bindingGeneration,
    };
  }

  private threadPath(context: Context): string {
    return `/threads/${context.execution.runtimeThreadId}`;
  }

  private async jsonRequest(
    path: string,
    method: 'GET' | 'POST',
    signal: AbortSignal,
    input?: unknown,
    options: { missing?: boolean; empty?: boolean; timeoutMs?: number } = {},
  ): Promise<unknown> {
    const budget = new RuntimeRequestBudget(signal);
    if (options.timeoutMs !== undefined) budget.arm(options.timeoutMs, 'runtime_request_timeout');
    try {
      const response = await this.request(path, method, budget, input);
      if (options.missing && response.status === 404) {
        void response.body?.cancel().catch(() => undefined);
        return null;
      }
      assertRuntimeSuccess(response);
      if (options.empty) {
        void response.body?.cancel().catch(() => undefined);
        return null;
      }
      return await readRuntimeJson(response, budget);
    } catch (error) {
      throw budget.safeError(error);
    } finally {
      budget.close();
    }
  }

  private request(
    path: string,
    method: 'GET' | 'POST',
    budget: RuntimeRequestBudget,
    input?: unknown,
    headers: Readonly<Record<string, string>> = {},
  ): Promise<Response> {
    const baseUrl = this.config.get<string>('AGENT_RUNTIME_URL') ?? '';
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new RuntimeClientError('runtime_not_configured');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new RuntimeClientError('runtime_not_configured');
    }
    budget.assertActive();
    return fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      redirect: 'error',
      signal: budget.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    });
  }
}
