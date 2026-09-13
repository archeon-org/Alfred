import { describe, expect, it } from 'vitest';

import { parseSseStream } from '@/services/executions/sse';

function streamOf(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>) {
  const events = [];
  for await (const event of parseSseStream(body)) events.push(event);
  return events;
}

describe('parseSseStream', () => {
  it('reassembles frames split across chunks and decodes JSON data', async () => {
    const events = await collect(
      streamOf([
        'event: execution\ndata: {"status":"pen',
        'ding"}\n\n: ping\n\nevent: messages/partial\r\ndata: [1,2]\r\n\r\n',
        'data: plain text\n\n',
        'event: tail\ndata: {"end":true}',
      ]),
    );
    expect(events).toEqual([
      { data: { status: 'pending' }, event: 'execution' },
      { data: [1, 2], event: 'messages/partial' },
      { data: 'plain text', event: 'message' },
      { data: { end: true }, event: 'tail' },
    ]);
  });

  it('joins multi-line data and ignores frames without data', async () => {
    const events = await collect(
      streamOf(['event: only\n\n', 'data: {"a":\ndata: 1}\n\n', 'id: 7\nretry: 100\n\n']),
    );
    expect(events).toEqual([{ data: { a: 1 }, event: 'message' }]);
  });
});
