import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SSE_HEARTBEAT_MS, SseWriter } from '@api/modules/stream/api/sse-writer';

class TestResponse extends EventEmitter {
  readonly chunks: string[] = [];
  destroyed = false;
  writableEnded = false;
  writableLength = 0;
  acceptsWrites = true;
  readonly status = vi.fn();
  readonly setHeader = vi.fn();
  readonly flushHeaders = vi.fn();
  readonly write = vi.fn((chunk: string) => {
    this.chunks.push(chunk);
    if (!this.acceptsWrites) this.writableLength += Buffer.byteLength(chunk);
    return this.acceptsWrites;
  });
  readonly end = vi.fn(() => {
    this.writableEnded = true;
  });
  readonly destroy = vi.fn(() => {
    this.destroyed = true;
    this.writableLength = 0;
    this.emit('close');
    return this;
  });

  asExpress(): Response {
    return this as unknown as Response;
  }

  drain(): void {
    this.acceptsWrites = true;
    this.writableLength = 0;
    this.emit('drain');
  }
}

describe('bounded SSE writer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('frames opaque ids, event names and JSON independently and flushes headers once', async () => {
    const response = new TestResponse();
    const writer = new SseWriter(response.asExpress());
    writer.open();
    writer.open();
    await expect(writer.write('reply\r\ntext', { text: 'a\nb' }, 'v1.opaque')).resolves.toBe(true);
    expect(response.chunks).toEqual([
      'id: v1.opaque\nevent: reply text\ndata: {"text":"a\\nb"}\n\n',
    ]);
    expect(response.flushHeaders).toHaveBeenCalledOnce();
    expect(response.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, no-transform');
    writer.close();
    writer.close();
    expect(response.end).toHaveBeenCalledOnce();
  });

  it('pauses all content and comment writes until a nonreading client drains', async () => {
    const response = new TestResponse();
    response.acceptsWrites = false;
    const writer = new SseWriter(response.asExpress(), { heartbeatMs: 100, drainTimeoutMs: 500 });
    writer.open();
    const first = writer.write('reply', 'one');
    const settled = vi.fn();
    void first.then(settled);
    const second = writer.write('reply', 'two');
    await vi.advanceTimersByTimeAsync(100);
    expect(response.chunks).toEqual(['event: reply\ndata: "one"\n\n']);
    expect(settled).not.toHaveBeenCalled();
    response.drain();
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(response.chunks).toEqual([
      'event: reply\ndata: "one"\n\n',
      'event: reply\ndata: "two"\n\n',
      ': ping\n\n',
    ]);
    writer.close();
    expect(response.listenerCount('drain')).toBe(0);
  });

  it('bounds ignored write promises and detaches an overloaded observer immediately', async () => {
    const response = new TestResponse();
    response.acceptsWrites = false;
    const onClose = vi.fn();
    const writer = new SseWriter(response.asExpress(), {
      maxFrameBytes: 80,
      maxBufferedBytes: 100,
      onClose,
    });
    writer.open();
    const writes = Array.from({ length: 1_000 }, () => writer.write('reply', 'x'.repeat(30)));
    expect(response.write).toHaveBeenCalledOnce();
    expect(response.destroy).toHaveBeenCalledOnce();
    expect(writer.signal.aborted).toBe(true);
    expect(await Promise.all(writes)).toEqual(Array<boolean>(1_000).fill(false));
    expect(onClose).toHaveBeenCalledExactlyOnceWith('slow_consumer');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses UTF-8 bytes for the frame limit', async () => {
    const response = new TestResponse();
    const writer = new SseWriter(response.asExpress(), { maxFrameBytes: 32 });
    writer.open();
    await expect(writer.write('text', '😀'.repeat(8))).resolves.toBe(false);
    expect(response.write).not.toHaveBeenCalled();
    expect(writer.signal.reason).toBe('frame_too_large');
  });

  it('bounds the number of tiny queued frames independently of the byte budget', async () => {
    const response = new TestResponse();
    response.acceptsWrites = false;
    const writer = new SseWriter(response.asExpress(), { maxPendingFrames: 2 });
    writer.open();
    const first = writer.write('x', 1);
    const second = writer.write('x', 2);
    const third = writer.write('x', 3);
    expect(await Promise.all([first, second, third])).toEqual([false, false, false]);
    expect(response.write).toHaveBeenCalledOnce();
    expect(writer.signal.reason).toBe('slow_consumer');
  });

  it('contains a failing close callback after cleaning up its observer', async () => {
    const warning = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    const response = new TestResponse();
    const writer = new SseWriter(response.asExpress(), {
      maxFrameBytes: 10,
      onClose: () => {
        throw new Error('SYNTHETIC_PRIVATE_VALUE');
      },
    });
    writer.open();
    await expect(writer.write('text', 'too large')).resolves.toBe(false);
    expect(warning).toHaveBeenCalledExactlyOnceWith('SSE observer close callback failed.', {
      code: 'SSE_CLOSE_CALLBACK_FAILED',
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('includes already buffered response bytes in its memory budget', async () => {
    const response = new TestResponse();
    const writer = new SseWriter(response.asExpress(), { maxFrameBytes: 50, maxBufferedBytes: 60 });
    writer.open();
    response.writableLength = 50;
    await expect(writer.write('text', 'x')).resolves.toBe(false);
    expect(response.write).not.toHaveBeenCalled();
    expect(writer.signal.reason).toBe('slow_consumer');
  });

  it('detaches a client that never drains without extending the timeout for later writes', async () => {
    const response = new TestResponse();
    response.acceptsWrites = false;
    const writer = new SseWriter(response.asExpress(), { drainTimeoutMs: 100 });
    writer.open();
    const first = writer.write('text', 'first');
    await vi.advanceTimersByTimeAsync(90);
    const second = writer.write('text', 'second');
    await vi.advanceTimersByTimeAsync(10);
    expect(await Promise.all([first, second])).toEqual([false, false]);
    expect(writer.signal.reason).toBe('slow_consumer');
    expect(response.destroy).toHaveBeenCalledOnce();
    expect(response.eventNames()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['close', 'error', 'abort'] as const)(
    'settles a drain wait on %s and removes listeners',
    async (event) => {
      const response = new TestResponse();
      response.acceptsWrites = false;
      const abort = new AbortController();
      const writer = new SseWriter(response.asExpress(), { signal: abort.signal });
      writer.open();
      const first = writer.write('text', 'first');
      const second = writer.write('text', 'second');
      if (event === 'abort') abort.abort(new Error('SYNTHETIC_PRIVATE_VALUE'));
      else response.emit(event, new Error('SYNTHETIC_PRIVATE_VALUE'));
      expect(await Promise.all([first, second])).toEqual([false, false]);
      expect(response.eventNames()).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
      expect(writer.signal.reason).not.toContain('SYNTHETIC_PRIVATE_VALUE');
    },
  );

  it('emits a comment every 25 seconds without moving the cursor and cleans up on close', async () => {
    const response = new TestResponse();
    const writer = new SseWriter(response.asExpress());
    writer.open();
    await vi.advanceTimersByTimeAsync(SSE_HEARTBEAT_MS * 2);
    expect(response.chunks).toEqual([': ping\n\n', ': ping\n\n']);
    writer.close();
    await vi.advanceTimersByTimeAsync(SSE_HEARTBEAT_MS);
    expect(response.chunks).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never opens a response after its observer signal was already aborted', () => {
    const response = new TestResponse();
    const abort = new AbortController();
    abort.abort();
    const writer = new SseWriter(response.asExpress(), { signal: abort.signal });
    writer.open();
    expect(response.flushHeaders).not.toHaveBeenCalled();
    expect(writer.closed).toBe(true);
  });

  it.each(['bad\nid', 'bad\rid', 'bad\0id'])(
    'rejects id field injection before writing bytes',
    async (id) => {
      const response = new TestResponse();
      const writer = new SseWriter(response.asExpress());
      writer.open();
      await expect(writer.write('text', {}, id)).resolves.toBe(false);
      expect(response.write).not.toHaveBeenCalled();
      expect(writer.signal.reason).toBe('invalid_frame');
    },
  );

  it('handles serialization and transport errors without leaking details', async () => {
    for (const failure of ['serialization', 'transport']) {
      const response = new TestResponse();
      const writer = new SseWriter(response.asExpress());
      writer.open();
      if (failure === 'transport')
        response.write.mockImplementation(() => {
          throw new Error('SYNTHETIC_PRIVATE_VALUE');
        });
      const data =
        failure === 'serialization'
          ? {
              toJSON: () => {
                throw new Error('SYNTHETIC_PRIVATE_VALUE');
              },
            }
          : {};
      await expect(writer.write('text', data)).resolves.toBe(false);
      expect(response.chunks).toEqual([]);
      expect(writer.signal.reason).not.toContain('SYNTHETIC_PRIVATE_VALUE');
    }
  });

  it.each([
    { heartbeatMs: 0 },
    { heartbeatMs: 60_000 },
    { heartbeatMs: Number.NaN },
    { drainTimeoutMs: Infinity },
    { maxFrameBytes: 0 },
    { maxPendingFrames: 0 },
    { maxPendingFrames: 4_097 },
    { maxFrameBytes: 100, maxBufferedBytes: 50 },
  ])('rejects unbounded or inconsistent transport options %j', (options) => {
    expect(() => new SseWriter(new TestResponse().asExpress(), options)).toThrow(
      'Invalid SSE writer options',
    );
  });
});
