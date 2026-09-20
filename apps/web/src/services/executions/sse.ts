import type { ExecutionStreamEvent } from '@alfred/contracts';

const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const MAX_CURSOR_LENGTH = 4096;

export class InvalidStreamError extends Error {
  constructor(message = 'Le flux de la conversation est invalide.') {
    super(message);
    this.name = 'InvalidStreamError';
  }
}

interface SseOptions {
  readonly maxFrameBytes?: number | undefined;
  readonly onChunk?: () => void;
}

/** Fetch SSE for bearer authentication. Only complete frames advance the observer cursor. */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  { maxFrameBytes = MAX_FRAME_BYTES, onChunk }: SseOptions = {},
): AsyncGenerator<ExecutionStreamEvent & { readonly id?: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const encoder = new TextEncoder();
  let buffer = '';
  let skipLeadingLf = false;
  let lines: string[] = [];
  let frameBytes = 0;
  let id: string | undefined;
  const checkSize = (size: number) => {
    if (size > maxFrameBytes) throw new InvalidStreamError('Un événement est trop volumineux.');
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (!done && value.byteLength > 0) onChunk?.();
      let decoded = done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (skipLeadingLf && decoded.length > 0) {
        if (decoded.startsWith('\n')) decoded = decoded.slice(1);
        skipLeadingLf = false;
      }
      buffer += decoded;
      for (;;) {
        const boundary = buffer.search(/[\r\n]/u);
        if (boundary === -1) break;
        skipLeadingLf = buffer[boundary] === '\r' && boundary === buffer.length - 1;
        const line = buffer.slice(0, boundary);
        const newlineLength = buffer.slice(boundary, boundary + 2) === '\r\n' ? 2 : 1;
        buffer = buffer.slice(boundary + newlineLength);
        frameBytes += encoder.encode(line).byteLength + newlineLength;
        checkSize(frameBytes);
        if (line !== '') {
          lines.push(line);
          continue;
        }
        const frame = parseFrame(lines, id);
        id = frame.id;
        lines = [];
        frameBytes = 0;
        if (frame.data !== null) yield frame.data;
      }
      checkSize(frameBytes + encoder.encode(buffer).byteLength);
      // A half-written event is not authoritative, including when the connection closes cleanly.
      if (done) return;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Fetch may already have errored/aborted; releasing its lock must still happen.
    }
    reader.releaseLock();
  }
}

function parseFrame(lines: readonly string[], previousId: string | undefined) {
  let event = 'message';
  let id = previousId;
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value || 'message';
    else if (field === 'data') data.push(value);
    else if (field === 'id' && !value.includes('\0')) {
      if (value.length > MAX_CURSOR_LENGTH) throw new InvalidStreamError();
      id = value;
    }
  }
  return {
    id,
    data:
      data.length === 0
        ? null
        : { data: decode(data.join('\n')), event, ...(id === undefined ? {} : { id }) },
  };
}

function decode(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}
