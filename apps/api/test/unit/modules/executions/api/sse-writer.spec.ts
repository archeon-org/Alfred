import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SseWriter } from '@api/modules/executions/api/sse-writer';

function fakeResponse() {
  const chunks: string[] = [];
  const response = {
    destroyed: false,
    end: vi.fn(function (this: { writableEnded: boolean }) {
      this.writableEnded = true;
    }),
    flushHeaders: vi.fn(),
    setHeader: vi.fn(),
    status: vi.fn(),
    writableEnded: false,
    write: vi.fn((chunk: string) => {
      chunks.push(chunk);
      return true;
    }),
  };
  return { chunks, response: response as unknown as Response, spies: response };
}

describe('SseWriter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens an event stream, frames events as JSON and ends the response once', () => {
    const { chunks, response, spies } = fakeResponse();
    const writer = new SseWriter(response, 1_000);

    writer.open();
    writer.write('messages/partial', [{ id: 'ai-1' }]);
    writer.write('bad\nname', undefined);
    writer.close();
    writer.close();

    expect(spies.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/event-stream; charset=utf-8',
    );
    expect(spies.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform');
    expect(spies.flushHeaders).toHaveBeenCalledOnce();
    expect(chunks).toEqual([
      'event: messages/partial\ndata: [{"id":"ai-1"}]\n\n',
      'event: bad name\ndata: null\n\n',
    ]);
    expect(spies.end).toHaveBeenCalledOnce();
  });

  it('sends comment heartbeats while open and stops them on close', () => {
    const { chunks, response } = fakeResponse();
    const writer = new SseWriter(response, 1_000);
    writer.open();
    vi.advanceTimersByTime(2_500);
    expect(chunks).toEqual([': ping\n\n', ': ping\n\n']);
    writer.close();
    vi.advanceTimersByTime(5_000);
    expect(chunks).toHaveLength(2);
  });

  it('drops writes after the client went away', () => {
    const { chunks, response, spies } = fakeResponse();
    const writer = new SseWriter(response, 1_000);
    writer.open();
    spies.writableEnded = true;
    writer.write('execution', { status: 'completed' });
    expect(chunks).toEqual([]);
  });
});
