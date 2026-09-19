import { setTimeout as delay } from 'node:timers/promises';
import { EXECUTION_STREAM_ERROR_EVENT, EXECUTION_STREAM_UNAVAILABLE_CODE } from '@alfred/contracts';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { ApiException } from '../../../common/errors/api.exception';
import { ExecutionObservationService } from '../../executions/application/execution-observation.service';
import { isExecutionSettled } from '../../executions/domain/execution-lifecycle';
import { SseWriter } from '../api/sse-writer';
import { translateObservedView, type ObservedView } from './ag-ui-translation';
import { observedView } from './observed-view';
import { StreamAuthorityService } from './stream-authority.service';

type Loaded = Awaited<ReturnType<ExecutionObservationService['load']>>;
interface Observed {
  revision: number;
  /** What this client has been told so far; the next change is translated on top of it. */
  view: ObservedView | null;
}

/**
 * Streams the committed Product projection as AG-UI events (ALF-DEC-006 §5): every attach
 * re-synthesizes the run from durable state, then each committed change becomes the smallest
 * continuing sequence. Native stream lifetime belongs only to the worker.
 */
@Injectable()
export class ExecutionObserverService {
  private readonly counts = new Map<string, number>();
  private observers = 0;
  constructor(
    private readonly observations: ExecutionObservationService,
    private readonly authority: StreamAuthorityService,
    private readonly config: ConfigService,
  ) {}

  async observe(
    principal: AuthPrincipal,
    id: string,
    authorization: string | undefined,
    cursor: string | undefined,
    response: Response,
  ): Promise<void> {
    const { expiresAt, loaded } = await this.bounded(async () => ({
      expiresAt: await this.authority.assert(principal, authorization),
      loaded: await this.observations.load(principal, id, cursor),
    }));
    if (expiresAt <= Date.now()) throw new UnauthorizedException('Stream authentication required');
    const release = this.reserve(principal.id);
    const writer = new SseWriter(response, {
      heartbeatMs: this.value('EXECUTION_SSE_HEARTBEAT_MS', 25_000),
      drainTimeoutMs: this.value('EXECUTION_SSE_DRAIN_TIMEOUT_MS', 10_000),
      maxFrameBytes: this.value('EXECUTION_SSE_MAX_FRAME_BYTES', 2_097_152),
      maxBufferedBytes: this.value('EXECUTION_SSE_MAX_BUFFERED_BYTES', 4_194_304),
    });
    // Expiry is derived from a verified token, independent of heartbeat/traffic frequency.
    const expiry = setTimeout(() => writer.close(), Math.max(0, expiresAt - Date.now()));
    let checking = false;
    const reauth = setInterval(
      () => {
        if (checking || writer.closed) return;
        checking = true;
        void this.reauthorize(principal, id, authorization, writer).finally(() => {
          checking = false;
        });
      },
      Math.max(1_000, this.value('EXECUTION_OBSERVER_REAUTH_MS', 25_000) - 5_000),
    );
    try {
      writer.open();
      const observed: Observed = { revision: -1, view: null };
      await this.send(writer, loaded, observed);
      if (writer.closed || this.terminal(loaded) || loaded.row.responseProfile === 'legacy') return;
      await this.followProgress(principal, loaded.row.id, writer, observed);
    } catch {
      // No provider payload or exception text crosses this boundary. Reconnect retrieves authority.
      if (!writer.closed)
        await writer.write(EXECUTION_STREAM_ERROR_EVENT, {
          code: EXECUTION_STREAM_UNAVAILABLE_CODE,
        });
    } finally {
      clearTimeout(expiry);
      clearInterval(reauth);
      writer.close();
      release();
    }
  }

  private async followProgress(
    principal: AuthPrincipal,
    id: string,
    writer: SseWriter,
    observed: Observed,
  ): Promise<void> {
    // Serialized reads coalesce committed token updates without creating another event journal.
    // Browser reconnect is independent of the native server's finite replay retention.
    while (!writer.closed) {
      await delay(500, undefined, { signal: writer.signal });
      const loaded = await this.bounded(() => this.observations.load(principal, id), writer.signal);
      if (writer.closed) return;
      if (loaded.state.sequence < observed.revision) continue;
      await this.send(writer, loaded, observed);
      if (this.terminal(loaded)) return;
    }
  }

  private async reauthorize(
    principal: AuthPrincipal,
    id: string,
    authorization: string | undefined,
    writer: SseWriter,
  ): Promise<void> {
    try {
      await this.bounded(async () => {
        await this.authority.assert(principal, authorization);
        await this.observations.load(principal, id);
      }, writer.signal);
    } catch {
      writer.close();
    }
  }

  private async bounded<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: (() => void) | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_resolve, reject) => {
          cancel = () => reject(new UnauthorizedException('Stream authentication required'));
          timer = setTimeout(cancel, 5_000);
          signal?.addEventListener('abort', cancel, { once: true });
          if (signal?.aborted) cancel();
        }),
      ]);
    } finally {
      clearTimeout(timer);
      if (cancel) signal?.removeEventListener('abort', cancel);
    }
  }

  /**
   * Attach opens the run and replays the visible answer and tool calls from the committed
   * projection; later reads send only what changed. A change AG-UI cannot continue closes the
   * observation so the browser re-attaches. The cursor rides on the last frame of each batch.
   */
  private async send(writer: SseWriter, loaded: Loaded, observed: Observed): Promise<void> {
    if (loaded.state.sequence < observed.revision) return;
    const view = observedView(loaded);
    const events = translateObservedView(observed.view, view);
    if (events.length === 0) return;
    const cursor = this.observations.cursor(loaded);
    for (const [index, event] of events.entries()) {
      const accepted = await writer.writeData(
        event,
        index === events.length - 1 ? cursor : undefined,
      );
      if (!accepted) return;
    }
    observed.revision = loaded.state.sequence;
    observed.view = view;
  }

  /** Terminal rows and parked rows with a confirmed native end need no further observation. */
  private terminal(loaded: Loaded): boolean {
    return isExecutionSettled(loaded.row);
  }

  private reserve(userId: string): () => void {
    const count = this.counts.get(userId) ?? 0;
    if (
      count >= this.value('EXECUTION_MAX_OBSERVERS_PER_USER', 4) ||
      this.observers >= this.value('EXECUTION_MAX_OBSERVERS_PER_INSTANCE', 128)
    ) {
      throw new ApiException(
        429,
        'stream_capacity_exceeded',
        'Too many active streams. Try again shortly.',
      );
    }
    this.counts.set(userId, count + 1);
    this.observers += 1;
    return () => {
      const next = (this.counts.get(userId) ?? 1) - 1;
      if (next <= 0) this.counts.delete(userId);
      else this.counts.set(userId, next);
      this.observers -= 1;
    };
  }

  private value(key: string, fallback: number): number {
    return this.config.get<number>(key) ?? fallback;
  }
}
