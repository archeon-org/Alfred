import type { Response } from 'express';

/** Keep heartbeat bytes below the declared 60-second ingress silence budget. */
export const SSE_HEARTBEAT_MS = 25_000;

export type SseCloseReason =
  | 'closed'
  | 'disconnected'
  | 'aborted'
  | 'slow_consumer'
  | 'frame_too_large'
  | 'invalid_frame'
  | 'transport_error';

export interface SseWriterOptions {
  readonly heartbeatMs?: number;
  readonly maxFrameBytes?: number;
  readonly maxBufferedBytes?: number;
  readonly maxPendingFrames?: number;
  readonly drainTimeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly onClose?: (reason: SseCloseReason) => void;
}

interface PendingFrame {
  readonly chunk: string;
  readonly bytes: number;
  /** A `data:` frame (an event), as opposed to a comment heartbeat. */
  readonly data: boolean;
  readonly resolve: (written: boolean) => void;
}

const defaults = {
  heartbeatMs: SSE_HEARTBEAT_MS,
  maxFrameBytes: 256 * 1_024,
  maxBufferedBytes: 1_024 * 1_024,
  maxPendingFrames: 128,
  drainTimeoutMs: 10_000,
} as const;

function validatedOptions(options: SseWriterOptions | number) {
  const value = {
    ...defaults,
    ...(typeof options === 'number' ? { heartbeatMs: options } : options),
  };
  const limits = [
    value.heartbeatMs,
    value.maxFrameBytes,
    value.maxBufferedBytes,
    value.maxPendingFrames,
    value.drainTimeoutMs,
  ];
  if (
    limits.some((limit) => !Number.isSafeInteger(limit) || limit < 1) ||
    value.heartbeatMs >= 60_000 ||
    value.drainTimeoutMs > 60_000 ||
    value.maxBufferedBytes > 16 * 1_024 * 1_024 ||
    value.maxPendingFrames > 4_096 ||
    value.maxFrameBytes > value.maxBufferedBytes
  ) {
    throw new Error('Invalid SSE writer options');
  }
  return value;
}

/**
 * One bounded observer, independent of execution lifetime. Await write() for backpressure;
 * even callers that ignore its promise cannot grow the queue beyond maxBufferedBytes.
 * A false result means the observer detached, not that the execution failed. Await the
 * final write before close(); close deliberately cancels any outstanding writes.
 */
export class SseWriter {
  private readonly options: ReturnType<typeof validatedOptions>;
  private readonly controller = new AbortController();
  private heartbeat: NodeJS.Timeout | undefined;
  private drainTimeout: NodeJS.Timeout | undefined;
  private frames: readonly PendingFrame[] = [];
  private queuedBytes = 0;
  private pending: PendingFrame | undefined;
  private opened = false;
  private written = { frames: 0, bytes: 0 };
  private readonly onDisconnect = () => this.finish('disconnected');
  private readonly onError = () => this.finish('transport_error');
  private readonly onAbort = () => this.finish('aborted');
  private readonly onDrain = () => {
    if (!this.pending || this.closed) return;
    clearTimeout(this.drainTimeout);
    this.drainTimeout = undefined;
    this.pending.resolve(true);
    this.pending = undefined;
    this.flush();
  };

  constructor(
    private readonly response: Response,
    options: SseWriterOptions | number = {},
  ) {
    this.options = validatedOptions(options);
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get closed(): boolean {
    return this.signal.aborted;
  }

  /** Why the observer detached, once it did. */
  get closeReason(): SseCloseReason | null {
    return this.closed ? (this.signal.reason as SseCloseReason) : null;
  }

  /** Events and bytes handed to the response so far (heartbeats and named frames: bytes only). */
  get sent(): { readonly frames: number; readonly bytes: number } {
    return { ...this.written };
  }

  open(): void {
    if (this.opened || this.closed) return;
    if (this.options.signal?.aborted) return this.finish('aborted');
    if (this.response.destroyed || this.response.writableEnded) return this.finish('disconnected');
    this.opened = true;
    this.response.on('close', this.onDisconnect);
    this.response.on('error', this.onError);
    this.response.on('drain', this.onDrain);
    this.options.signal?.addEventListener('abort', this.onAbort, { once: true });
    try {
      this.response.status(200);
      this.response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      this.response.setHeader('Cache-Control', 'no-store, no-transform');
      this.response.setHeader('Connection', 'keep-alive');
      this.response.setHeader('X-Accel-Buffering', 'no');
      this.response.flushHeaders();
      if (this.closed) return;
      this.heartbeat = setInterval(
        () => void this.enqueue(': ping\n\n', false),
        this.options.heartbeatMs,
      );
      this.heartbeat.unref();
    } catch {
      this.finish('transport_error');
    }
  }

  write(event: string, data: unknown, id?: string): Promise<boolean> {
    if (event.includes('\0')) {
      this.finish('invalid_frame');
      return Promise.resolve(false);
    }
    return this.frame(`event: ${event.replaceAll(/[\r\n]+/gu, ' ')}\n`, data, id);
  }

  /** An unnamed `data:` frame, the shape AG-UI clients read; the cursor travels as `id:`. */
  writeData(data: unknown, id?: string): Promise<boolean> {
    return this.frame('', data, id);
  }

  private frame(header: string, data: unknown, id?: string): Promise<boolean> {
    if (this.closed || !this.opened) return Promise.resolve(false);
    if (/[\r\n\0]/u.test(id ?? '')) {
      this.finish('invalid_frame');
      return Promise.resolve(false);
    }
    try {
      const cursor = id === undefined ? '' : `id: ${id}\n`;
      // Only unnamed frames are AG-UI events; a named transport frame counts as bytes.
      return this.enqueue(
        `${cursor}${header}data: ${JSON.stringify(data) ?? 'null'}\n\n`,
        header === '',
      );
    } catch {
      this.finish('invalid_frame');
      return Promise.resolve(false);
    }
  }

  close(): void {
    this.finish('closed');
  }

  private enqueue(chunk: string, data: boolean): Promise<boolean> {
    if (this.closed) return Promise.resolve(false);
    if (this.response.writableEnded || this.response.destroyed) {
      this.finish('disconnected');
      return Promise.resolve(false);
    }
    const bytes = Buffer.byteLength(chunk);
    if (bytes > this.options.maxFrameBytes) {
      this.finish('frame_too_large');
      return Promise.resolve(false);
    }
    if (
      this.queuedBytes + this.response.writableLength + bytes > this.options.maxBufferedBytes ||
      this.frames.length + (this.pending ? 1 : 0) >= this.options.maxPendingFrames
    ) {
      this.finish('slow_consumer');
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      this.frames = [...this.frames, { bytes, chunk, data, resolve }];
      this.queuedBytes += bytes;
      this.flush();
    });
  }

  private flush(): void {
    while (!this.closed && !this.pending && this.frames.length > 0) {
      const frame = this.frames[0];
      if (!frame) return;
      this.frames = this.frames.slice(1);
      this.queuedBytes -= frame.bytes;
      this.pending = frame;
      try {
        const accepted = this.response.write(frame.chunk);
        this.written = {
          frames: this.written.frames + (frame.data ? 1 : 0),
          bytes: this.written.bytes + frame.bytes,
        };
        if (this.closed) return;
        if (accepted === false) {
          this.drainTimeout = setTimeout(
            () => this.finish('slow_consumer'),
            this.options.drainTimeoutMs,
          );
          this.drainTimeout.unref();
          return;
        }
        this.pending = undefined;
        frame.resolve(true);
      } catch {
        this.finish('transport_error');
      }
    }
  }

  private finish(reason: SseCloseReason): void {
    if (this.closed) return;
    const hasPendingWrites = this.pending !== undefined || this.frames.length > 0;
    clearInterval(this.heartbeat);
    clearTimeout(this.drainTimeout);
    if (this.opened) {
      this.response.removeListener('close', this.onDisconnect);
      this.response.removeListener('error', this.onError);
      this.response.removeListener('drain', this.onDrain);
    }
    this.options.signal?.removeEventListener('abort', this.onAbort);
    this.pending?.resolve(false);
    for (const frame of this.frames) frame.resolve(false);
    this.pending = undefined;
    this.frames = [];
    this.queuedBytes = 0;
    this.controller.abort(reason);
    if (!this.response.destroyed && !this.response.writableEnded) {
      if (reason === 'closed' && !hasPendingWrites) this.response.end();
      else this.response.destroy();
    }
    try {
      this.options.onClose?.(reason);
    } catch {
      // Notification callbacks cannot break observer cleanup or leak arbitrary exceptions.
      process.emitWarning('SSE observer close callback failed.', {
        code: 'SSE_CLOSE_CALLBACK_FAILED',
      });
    }
  }
}
