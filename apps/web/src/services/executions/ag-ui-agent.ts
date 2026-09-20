import { AbstractAgent } from '@ag-ui/client';
import type { BaseEvent } from '@ag-ui/core';
import { Observable } from 'rxjs';

import { observeExecution } from '@/services/executions/executions.service';
import type { HttpClient } from '@/services/http/http-client';

export interface AlfredExecutionAgentOptions {
  readonly client: HttpClient;
  readonly executionId: string;
  readonly conversationId: string;
  readonly cursor: string | null;
  readonly signal: AbortSignal;
}

/**
 * AG-UI agent whose transport is Alfred's authenticated, resumable observation stream. Running
 * it never submits work: the run input is ignored and the route is a GET. The AG-UI `threadId`
 * is the conversation and the `runId` is the execution (ALF-DEC-032/033).
 */
export class AlfredExecutionAgent extends AbstractAgent {
  /** Opaque resume position of the last frame received; reused by the next attach. */
  cursor: string | null;
  /**
   * Transport failure of the last run. The stream completes normally so the AG-UI client neither
   * logs nor rethrows it; the observer decides whether it is retryable.
   */
  failure: unknown = null;
  /** Events handed to the AG-UI client during the current run. */
  emitted = 0;
  /**
   * Number of events that re-synthesize the run on attach: the API writes the cursor on the last
   * frame of each batch, so the first frame carrying one closes the re-synthesis. Null until then.
   */
  resynthesis: number | null = null;
  private readonly detach = new AbortController();

  constructor(private readonly options: AlfredExecutionAgentOptions) {
    super({ agentId: 'alfred', threadId: options.conversationId });
    this.cursor = options.cursor;
  }

  /** Ends the transport of the current run; the run then completes without further events. */
  abort(): void {
    this.detach.abort();
  }

  /** The run input is ignored: observation reattaches to work the API already owns. */
  run(): Observable<BaseEvent> {
    this.failure = null;
    this.emitted = 0;
    this.resynthesis = null;
    return new Observable<BaseEvent>((subscriber) => {
      const unsubscribed = new AbortController();
      const signal = AbortSignal.any([
        this.options.signal,
        this.detach.signal,
        unsubscribed.signal,
      ]);
      void (async () => {
        try {
          for await (const frame of observeExecution(
            this.options.client,
            this.options.executionId,
            signal,
            this.cursor,
            this.options.conversationId,
          )) {
            this.emitted += 1;
            if (frame.id !== undefined) {
              this.cursor = frame.id;
              this.resynthesis ??= this.emitted;
            }
            subscriber.next(frame.event);
          }
        } catch (error) {
          this.failure = error;
        }
        subscriber.complete();
      })();
      return () => unsubscribed.abort();
    });
  }
}
