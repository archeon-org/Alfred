import { setTimeout as delay } from 'node:timers/promises';
import { EXECUTION_STREAM_ERROR_EVENT, EXECUTION_STREAM_UNAVAILABLE_CODE } from '@alfred/contracts';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { ApiException } from '../../../common/errors/api.exception';
import { ExecutionObservationService } from '../../executions/application/execution-observation.service';
import { isExecutionSettled } from '../../executions/domain/execution-lifecycle';
import { SseWriter } from '../api/sse-writer';
import { translateObservedView, type ObservedView } from './ag-ui-translation';
import {
  errorEnd,
  observationEndLevel,
  ObservationEnding,
  ObservationLoadTimeout,
  ObservationRevisionRegressed,
  writerEnd,
  type ObservationEnd,
  type ObservationEndRecord,
} from './observation-end';
import { ObservedWorkCache, observedView } from './observed-view';
import { StreamAuthorityService } from './stream-authority.service';

type Loaded = Awaited<ReturnType<ExecutionObservationService['load']>>;
const UNEXPLAINED: ObservationEnd = { reason: 'error', errorName: 'UnexplainedClose' };
interface Observed {
  revision: number;
  /** What this client has been told so far; the next change is translated on top of it. */
  view: ObservedView | null;
  /** The files of the user turn, read at attach and reused by every later poll. */
  attachments: Loaded['attachments'];
}

/**
 * Streams the committed Product projection as AG-UI events (ALF-DEC-006 §5): every attach
 * re-synthesizes the run from durable state, then each committed change becomes the smallest
 * continuing sequence. Native stream lifetime belongs only to the worker.
 */
@Injectable()
export class ExecutionObserverService {
  private readonly logger = new Logger(ExecutionObserverService.name);
  private readonly counts = new Map<string, number>();
  private observers = 0;
  /** Work logs by committed revision, shared by the observers of this instance. */
  private readonly works = new ObservedWorkCache();

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
    const attachedAt = Date.now();
    const { expiresAt, loaded } = await this.attach(
      principal,
      id,
      authorization,
      cursor,
      attachedAt,
    );
    if (expiresAt <= Date.now()) throw new UnauthorizedException('Stream authentication required');
    const release = this.reserve(principal.id);
    const writer = new SseWriter(response, {
      heartbeatMs: this.value('EXECUTION_SSE_HEARTBEAT_MS', 25_000),
      drainTimeoutMs: this.value('EXECUTION_SSE_DRAIN_TIMEOUT_MS', 10_000),
      maxFrameBytes: this.value('EXECUTION_SSE_MAX_FRAME_BYTES', 2_097_152),
      maxBufferedBytes: this.value('EXECUTION_SSE_MAX_BUFFERED_BYTES', 4_194_304),
    });
    const ending = new ObservationEnding();
    // Expiry is derived from a verified token, independent of heartbeat/traffic frequency.
    const expiry = setTimeout(
      () => {
        ending.record({ reason: 'token_expired' });
        writer.close();
      },
      Math.max(0, expiresAt - Date.now()),
    );
    let checking = false;
    const reauth = setInterval(
      () => {
        if (checking || writer.closed) return;
        checking = true;
        void this.reauthorize(principal, id, authorization, writer, ending).finally(() => {
          checking = false;
        });
      },
      Math.max(1_000, this.value('EXECUTION_OBSERVER_REAUTH_MS', 25_000) - 5_000),
    );
    try {
      writer.open();
      const observed: Observed = {
        revision: -1,
        view: null,
        attachments: loaded.attachments,
      };
      const delivered = await this.send(writer, loaded, observed);
      if (writer.closed || !delivered) return;
      if (this.terminal(loaded)) return ending.record({ reason: 'terminal' });
      if (loaded.row.responseProfile === 'legacy')
        return ending.record({ reason: 'legacy_snapshot' });
      await this.followProgress(principal, loaded.row.id, writer, observed, ending);
    } catch (error) {
      ending.record(writerEnd(writer.closeReason));
      ending.record(errorEnd(error));
      // No provider payload or exception text crosses this boundary. Reconnect retrieves authority.
      if (!writer.closed)
        await writer.write(EXECUTION_STREAM_ERROR_EVENT, {
          code: EXECUTION_STREAM_UNAVAILABLE_CODE,
        });
    } finally {
      clearTimeout(expiry);
      clearInterval(reauth);
      ending.record(writerEnd(writer.closeReason));
      writer.close();
      release();
      this.logEnd(id, ending.current ?? UNEXPLAINED, attachedAt, {
        events: writer.sent.frames,
        bytes: writer.sent.bytes,
        resumed: cursor !== undefined,
        opened: true,
      });
    }
  }

  /**
   * Before any header, a bounded authority or projection read that times out is a transient
   * unavailability (503, retried with backoff), not an authentication refusal: nothing is opened
   * and nothing is disclosed. It is logged like any other ended observation.
   */
  private async attach(
    principal: AuthPrincipal,
    id: string,
    authorization: string | undefined,
    cursor: string | undefined,
    attachedAt: number,
  ): Promise<{ expiresAt: number; loaded: Loaded }> {
    try {
      return await this.bounded(async () => ({
        expiresAt: await this.authority.assert(principal, authorization),
        loaded: await this.observations.load(principal, id, cursor),
      }));
    } catch (error) {
      if (!(error instanceof ObservationLoadTimeout)) throw error;
      this.logEnd(id, { reason: 'load_timeout' }, attachedAt, {
        events: 0,
        bytes: 0,
        resumed: cursor !== undefined,
        opened: false,
      });
      throw new ApiException(
        503,
        EXECUTION_STREAM_UNAVAILABLE_CODE,
        'The execution stream is temporarily unavailable.',
      );
    }
  }

  private async followProgress(
    principal: AuthPrincipal,
    id: string,
    writer: SseWriter,
    observed: Observed,
    ending: ObservationEnding,
  ): Promise<void> {
    // Serialized reads coalesce committed token updates without creating another event journal.
    // Browser reconnect is independent of the native server's finite replay retention.
    while (!writer.closed) {
      await delay(500, undefined, { signal: writer.signal });
      const loaded = await this.bounded(
        () => this.observations.load(principal, id, undefined, observed.attachments),
        writer.signal,
      );
      if (writer.closed) return;
      if (loaded.state.sequence < observed.revision) {
        // A read older than what was sent is skipped. A settled one cannot be older than a running
        // one already sent: its commit went backwards, so the browser re-attaches to it at once.
        if (this.terminal(loaded)) throw new ObservationRevisionRegressed();
        continue;
      }
      const delivered = await this.send(writer, loaded, observed);
      if (delivered && this.terminal(loaded)) return ending.record({ reason: 'terminal' });
    }
  }

  private async reauthorize(
    principal: AuthPrincipal,
    id: string,
    authorization: string | undefined,
    writer: SseWriter,
    ending: ObservationEnding,
  ): Promise<void> {
    try {
      await this.bounded(async () => {
        await this.authority.assert(principal, authorization);
        // Only access is checked here: the turn's files are not read again.
        await this.observations.load(principal, id, undefined, []);
      }, writer.signal);
    } catch {
      if (!writer.closed) ending.record({ reason: 'reauthorization_failed' });
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
          // Detachment is reported by the writer's own close reason, a hung read by its class.
          cancel = () => reject(new Error('Observation detached'));
          timer = setTimeout(() => reject(new ObservationLoadTimeout()), 5_000);
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
   * Exactly one structured line per ended attach: identifiers, reason codes, counts and duration,
   * never user content, prompts, reasoning or tool payloads.
   */
  private logEnd(
    executionId: string,
    end: ObservationEnd,
    startedAt: number,
    counts: Pick<ObservationEndRecord, 'events' | 'bytes' | 'resumed' | 'opened'>,
  ): void {
    const record: ObservationEndRecord = {
      event: 'execution_observation_ended',
      executionId,
      ...end,
      durationMs: Math.max(0, Date.now() - startedAt),
      ...counts,
    };
    // The JSON logger keeps only string messages; the record is serialized whole into it.
    if (observationEndLevel(end) === 'info') this.logger.log(JSON.stringify(record));
    else this.logger.warn(JSON.stringify(record));
  }

  /**
   * Attach opens the run and replays the visible answer and tool calls from the committed
   * projection; later reads send only what changed. A change AG-UI cannot continue closes the
   * observation so the browser re-attaches. The cursor rides on the last frame of each batch.
   */
  private async send(writer: SseWriter, loaded: Loaded, observed: Observed): Promise<boolean> {
    const view = observedView(loaded, this.works);
    const events = translateObservedView(observed.view, view);
    if (events.length === 0) return true;
    const cursor = this.observations.cursor(loaded);
    for (const [index, event] of events.entries()) {
      const accepted = await writer.writeData(
        event,
        index === events.length - 1 ? cursor : undefined,
      );
      if (!accepted) return false;
    }
    observed.revision = loaded.state.sequence;
    observed.view = view;
    return true;
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
