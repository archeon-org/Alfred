import type { ExecutionStreamEvent } from '@alfred/contracts';

/**
 * Parses a Server-Sent Events body into `{ event, data }` items. `data` is JSON-decoded when
 * possible and left as text otherwise; comment lines (heartbeats) and unknown fields are ignored.
 * `fetch` is used instead of `EventSource` because the API expects a bearer header and a POST body.
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ExecutionStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      buffer = buffer.replaceAll('\r\n', '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = parseFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (frame !== null) yield frame;
        boundary = buffer.indexOf('\n\n');
      }
      if (done) {
        const last = parseFrame(buffer);
        if (last !== null) yield last;
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(frame: string): ExecutionStreamEvent | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  if (data.length === 0) return null;
  const raw = data.join('\n');
  return { data: decode(raw), event };
}

function decode(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}
