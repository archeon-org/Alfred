import type { Response } from 'express';

/** Transport heartbeat below the usual 60 s gateway idle timeout (ALF-DEC-006 liveness budget). */
export const SSE_HEARTBEAT_MS = 25_000;

/**
 * Minimal Server-Sent Events writer over the Express response. Frames are `event:` + one `data:`
 * line of JSON; heartbeats are SSE comments, so clients ignore them and the cursor never moves.
 */
export class SseWriter {
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(
    private readonly response: Response,
    private readonly heartbeatMs = SSE_HEARTBEAT_MS,
  ) {}

  open(): void {
    this.response.status(200);
    this.response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    this.response.setHeader('Cache-Control', 'no-cache, no-transform');
    this.response.setHeader('Connection', 'keep-alive');
    this.response.setHeader('X-Accel-Buffering', 'no');
    this.response.flushHeaders();
    this.heartbeat = setInterval(() => this.raw(': ping\n\n'), this.heartbeatMs);
  }

  write(event: string, data: unknown): void {
    const name = event.replaceAll(/[\r\n]+/gu, ' ');
    this.raw(`event: ${name}\ndata: ${JSON.stringify(data) ?? 'null'}\n\n`);
  }

  close(): void {
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (!this.response.writableEnded) this.response.end();
  }

  private raw(chunk: string): void {
    if (this.response.writableEnded || this.response.destroyed) return;
    this.response.write(chunk);
  }
}
