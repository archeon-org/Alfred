import type { ExecutionStreamEvent } from '@alfred/contracts';

/** Structured answer of the runtime title graph. `language` is null for its neutral fallback. */
export interface GeneratedTitle {
  readonly title: string;
  readonly language: string | null;
}

/**
 * Port to the private agent runtime (ALF-DEC-003/050). Application code never touches the vendor
 * SDK, thread tables or checkpoints directly; the adapter behind this port is replaceable.
 */
export interface RuntimeClient {
  createThread(metadata: Readonly<Record<string, string>>): Promise<{ readonly threadId: string }>;
  /** Native stream events of one run, relayed unchanged. `onRunCreated` reports the run id. */
  stream(
    threadId: string,
    input: unknown,
    options: {
      readonly signal: AbortSignal;
      readonly onRunCreated?: (runId: string) => void;
    },
  ): AsyncIterable<ExecutionStreamEvent>;
  /**
   * Asks the runtime to stop a run the product no longer follows (the user pressed stop or left).
   * Disconnecting alone is not a cancellation; the caller tolerates failures.
   */
  cancel(threadId: string, runId: string): Promise<void>;
  /**
   * Titles a conversation from its first user message through a stateless run of the title
   * graph. Resolves null when the graph is disabled or answers without a usable title.
   */
  generateTitle(
    message: string,
    options: { readonly signal: AbortSignal },
  ): Promise<GeneratedTitle | null>;
}

export const RUNTIME_CLIENT = Symbol('RUNTIME_CLIENT');
