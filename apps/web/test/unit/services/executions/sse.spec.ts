import { describe, expect, it, vi } from 'vitest';

import { parseSseStream } from '@/services/executions/sse';

function streamOf(chunks: readonly (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>, maxFrameBytes?: number) {
  const events = [];
  for await (const event of parseSseStream(body, { maxFrameBytes })) events.push(event);
  return events;
}

describe('parseSseStream', () => {
  it('reassembles frames, retains opaque cursors and ignores an unfinished final frame', async () => {
    const events = await collect(
      streamOf([
        'id: cursor:1\nevent: execution\ndata: {"status":"pen',
        'ding"}\n\n: ping\n\nevent: snapshot\r\ndata: [1,2]\r\n\r\n',
        'id: cursor:2\ndata: plain text\n\n',
        'event: tail\ndata: {"end":true}',
      ]),
    );
    expect(events).toEqual([
      { data: { status: 'pending' }, event: 'execution', id: 'cursor:1' },
      { data: [1, 2], event: 'snapshot', id: 'cursor:1' },
      { data: 'plain text', event: 'message', id: 'cursor:2' },
    ]);
  });

  it('preserves UTF-8 characters split at every byte and CRLF split at every boundary', async () => {
    const bytes = new TextEncoder().encode('id: one\r\nevent: snapshot\r\ndata: "été 🌍"\r\n\r\n');
    expect(await collect(streamOf([...bytes].map((byte) => Uint8Array.of(byte))))).toEqual([
      { event: 'snapshot', data: 'été 🌍', id: 'one' },
    ]);
  });

  it('supports CR and LF line endings, multiline data and ignores invalid cursor ids', async () => {
    expect(
      await collect(
        streamOf([
          'event: only\r\r',
          'id: good\rdata: {"a":\rdata: 1}\r\r',
          'id: bad\u0000id\ndata: 2\n\n',
          'id:\ndata: 3\n\n',
        ]),
      ),
    ).toEqual([
      { data: { a: 1 }, event: 'message', id: 'good' },
      { data: 2, event: 'message', id: 'good' },
      { data: 3, event: 'message', id: '' },
    ]);
  });

  it('rejects invalid UTF-8 instead of corrupting a visible response', async () => {
    await expect(collect(streamOf([Uint8Array.of(0xff)]))).rejects.toThrow();
  });

  it.each([
    ['data: ' + 'x'.repeat(64)],
    ['data: ' + 'x'.repeat(32) + '\n', 'data: ' + 'y'.repeat(32) + '\n\n'],
    ['data: ' + 'é'.repeat(30) + '\n\n'],
    [': ' + 'x'.repeat(64)],
  ])('bounds frames and unterminated data by UTF-8 bytes', async (...chunks) => {
    await expect(collect(streamOf(chunks), 64)).rejects.toThrow('trop volumineux');
  });

  it('accepts the full public cursor bound and rejects a cursor beyond it', async () => {
    const cursor = 'x'.repeat(4096);
    expect(await collect(streamOf([`id: ${cursor}\ndata: 1\n\n`]))).toEqual([
      { event: 'message', data: 1, id: cursor },
    ]);
    await expect(collect(streamOf([`id: ${cursor}x\ndata: 1\n\n`]))).rejects.toThrow('invalide');
  });

  it('dispatches CR-only frames immediately while the connection stays open', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: 1\r\r'));
      },
    });
    const iterator = parseSseStream(body);
    expect(await iterator.next()).toMatchObject({ value: { data: 1 }, done: false });
    await iterator.return(undefined);
  });

  it('accepts a large chunk containing many separately bounded frames', async () => {
    expect(await collect(streamOf(['data: 1\n\n'.repeat(100)]), 32)).toHaveLength(100);
  });

  it('cancels its reader when an observer stops consuming', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: 1\n\n'));
      },
      cancel,
    });
    for await (const event of parseSseStream(body)) {
      expect(event.data).toBe(1);
      break;
    }
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });
});
