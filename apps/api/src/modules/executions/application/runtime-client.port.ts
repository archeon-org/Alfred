/** Private integration contract; callers never select raw runtime thread or run coordinates. */
export interface GeneratedTitle {
  readonly title: string;
  readonly language: string | null;
}

export interface RuntimeRun {
  readonly executionId: string;
  readonly invocationId: string;
  readonly threadId: string;
  readonly runId: string | null;
  readonly status:
    | 'dispatching'
    | 'unresolved'
    | 'pending'
    | 'running'
    | 'success'
    | 'error'
    | 'interrupted'
    | 'timeout';
  readonly stopRequested: boolean;
  readonly replayAvailable: boolean;
}

export interface RuntimeEvent {
  readonly id: string;
  readonly event: string;
  readonly data: unknown;
}

export interface RuntimeClient {
  dispatch(executionId: string, invocationId: string, signal: AbortSignal): Promise<RuntimeRun>;
  inspect(executionId: string, invocationId: string, signal: AbortSignal): Promise<RuntimeRun>;
  join(
    executionId: string,
    invocationId: string,
    options: {
      readonly after: string | null;
      readonly signal: AbortSignal;
    },
  ): AsyncIterable<RuntimeEvent>;
  cancel(executionId: string, invocationId: string, signal: AbortSignal): Promise<RuntimeRun>;
  generateTitle(
    executionId: string,
    invocationId: string,
    signal: AbortSignal,
  ): Promise<GeneratedTitle | null>;
}

export class RuntimeClientError extends Error {
  constructor(readonly code: string) {
    super('The runtime request could not be completed.');
    this.name = 'RuntimeClientError';
  }
}

/**
 * A dispatch that failed in local work, before any run creation was requested. It is the one
 * dispatch failure that proves no native run exists, so the invocation may be dispatched again.
 */
export const RUNTIME_NOT_DISPATCHED = 'runtime_not_dispatched';

export const RUNTIME_CLIENT = Symbol('RUNTIME_CLIENT');
