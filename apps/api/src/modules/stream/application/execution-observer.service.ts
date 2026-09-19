import { setTimeout as delay } from 'node:timers/promises';
import {
  EXECUTION_DELTA_SSE_EVENT,
  EXECUTION_SNAPSHOT_SSE_EVENT,
  type ExecutionSnapshot,
} from '@alfred/contracts';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { ApiException } from '../../../common/errors/api.exception';
import { ExecutionObservationService } from '../../executions/application/execution-observation.service';
import { isExecutionSettled } from '../../executions/domain/execution-lifecycle';
import { SseWriter } from '../api/sse-writer';
import { executionDelta } from './execution-delta';
import { StreamAuthorityService } from './stream-authority.service';

type Loaded = Awaited<ReturnType<ExecutionObservationService['load']>>;
interface Observed {
  revision: number;
  fingerprint: string;
  /** Last frame the client holds; the next change travels as a delta on top of it. */
  snapshot: ExecutionSnapshot | null;
}

/** Streams committed Product snapshots; native stream lifetime belongs only to the worker. */
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
      const observed: Observed = { revision: -1, fingerprint: '', snapshot: null };
      await this.send(writer, loaded, observed);
      if (writer.closed || this.terminal(loaded) || loaded.row.responseProfile === 'legacy') return;
      await this.followProgress(principal, loaded.row.id, writer, observed);
    } catch {
      // No provider payload or exception text crosses this boundary. Reconnect retrieves authority.
      if (!writer.closed) await writer.write('error', { code: 'execution_stream_unavailable' });
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
   * First frame and settled states are full snapshots; every change in between is a delta on top
   * of the frame this client already holds, so a long answer is not resent on every revision.
   */
  private async send(writer: SseWriter, loaded: Loaded, observed: Observed): Promise<void> {
    const snapshot = this.observations.present(loaded);
    const fingerprint = JSON.stringify({ ...snapshot, cursor: undefined });
    if (snapshot.revision < observed.revision || fingerprint === observed.fingerprint) return;
    const cursor = snapshot.cursor ?? undefined;
    const accepted =
      observed.snapshot === null || this.terminal(loaded)
        ? await writer.write(EXECUTION_SNAPSHOT_SSE_EVENT, snapshot, cursor)
        : await writer.write(
            EXECUTION_DELTA_SSE_EVENT,
            executionDelta(observed.snapshot, snapshot),
            cursor,
          );
    if (accepted) {
      observed.revision = snapshot.revision;
      observed.fingerprint = fingerprint;
      observed.snapshot = snapshot;
    }
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
