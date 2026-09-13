import type { ExecutionStreamEvent } from '@alfred/contracts';
import { Client } from '@langchain/langgraph-sdk';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AgentRuntimeStreamMode } from '../../../../config/environment';
import type { GeneratedTitle, RuntimeClient } from '../../application/runtime-client.port';

const STREAM_TIMEOUT_MS = 10 * 60 * 1000;
/** The title graph budgets about 8 s of model time; the request budget stays slightly above it. */
const TITLE_TIMEOUT_MS = 12_000;
const CANCEL_TIMEOUT_MS = 5_000;

/**
 * LangGraph Platform adapter over the official SDK. First slice: no runtime authentication, no
 * resumable streams and no AG-UI translation; those arrive with later decision slices.
 */
@Injectable()
export class LangGraphRuntimeClient implements RuntimeClient {
  private readonly client: Client;
  private readonly assistantId: string;
  private readonly titleAssistantId: string;
  private readonly streamModes: readonly AgentRuntimeStreamMode[];

  constructor(config: ConfigService) {
    this.client = new Client({
      apiUrl: config.getOrThrow<string>('AGENT_RUNTIME_URL'),
      timeoutMs: STREAM_TIMEOUT_MS,
    });
    this.assistantId = config.getOrThrow<string>('AGENT_RUNTIME_ASSISTANT_ID');
    this.titleAssistantId = config.getOrThrow<string>('AGENT_RUNTIME_TITLE_ASSISTANT_ID');
    this.streamModes = config.getOrThrow<readonly AgentRuntimeStreamMode[]>(
      'AGENT_RUNTIME_STREAM_MODES',
    );
  }

  async createThread(metadata: Readonly<Record<string, string>>) {
    const thread = await this.client.threads.create({ metadata: { ...metadata } });
    return { threadId: thread.thread_id };
  }

  async *stream(
    threadId: string,
    input: unknown,
    options: { readonly signal: AbortSignal; readonly onRunCreated?: (runId: string) => void },
  ): AsyncIterable<ExecutionStreamEvent> {
    const events = this.client.runs.stream(threadId, this.assistantId, {
      input: input as Record<string, unknown>,
      // The server default keeps a run alive after a disconnect; the product wants it stopped.
      onDisconnect: 'cancel',
      onRunCreated: ({ run_id }) => options.onRunCreated?.(run_id),
      signal: options.signal,
      streamMode: [...this.streamModes],
    });
    for await (const chunk of events) {
      yield { data: chunk.data, event: chunk.event };
    }
  }

  /** Explicit cancellation on top of the disconnect mode; interrupts the run where it stands. */
  async cancel(threadId: string, runId: string): Promise<void> {
    await this.client.runs.cancel(threadId, runId, false, 'interrupt', {
      signal: AbortSignal.timeout(CANCEL_TIMEOUT_MS),
    });
  }

  /** Stateless run (`threadId: null`): nothing is persisted on the runtime for the title. */
  async generateTitle(
    message: string,
    options: { readonly signal: AbortSignal },
  ): Promise<GeneratedTitle | null> {
    if (this.titleAssistantId === '') return null;
    const output = await this.client.runs.wait(null, this.titleAssistantId, {
      input: { messages: [{ content: message, role: 'user' }] },
      signal: AbortSignal.any([options.signal, AbortSignal.timeout(TITLE_TIMEOUT_MS)]),
    });
    const { language, title } = (output ?? {}) as { language?: unknown; title?: unknown };
    if (typeof title !== 'string') return null;
    return { language: typeof language === 'string' ? language : null, title };
  }
}
