import { RuntimeClientError, type RuntimeEvent } from '../../application/runtime-client.port';
import {
  readRuntimeChunk,
  RUNTIME_STREAM_IDLE_MS,
  type RuntimeRequestBudget,
} from './runtime-http.transport';

const MAX_FRAME_BYTES = 1_048_576;
const MAX_SOURCE_ID_LENGTH = 512;

const hasControlOrSpace = (value: string): boolean =>
  Array.from(value).some(
    (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
  );

export function validateNativePosition(position: string): void {
  if (!position || position.length > MAX_SOURCE_ID_LENGTH || hasControlOrSpace(position)) {
    throw new RuntimeClientError('runtime_cursor_invalid');
  }
}

/** Each native event must carry its own source ID; never invent an ID for transport errors. */
class RuntimeFrameParser {
  private line = '';
  private skipLf = false;
  private frameBytes = 0;
  private sourceId = '';
  private event = 'message';
  private data: string[] = [];

  *push(text: string): Iterable<RuntimeEvent> {
    let start = 0;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (this.skipLf) {
        this.skipLf = false;
        if (character === '\n') {
          start = index + 1;
          continue;
        }
      }
      if (character !== '\r' && character !== '\n') continue;
      this.append(text.slice(start, index));
      const event = this.consumeLine();
      if (event) yield event;
      this.skipLf = character === '\r';
      start = index + 1;
    }
    this.append(text.slice(start));
  }

  finish(): void {
    if (this.data.length || (this.line && !this.line.startsWith(':'))) {
      throw new RuntimeClientError('runtime_stream_interrupted');
    }
  }

  private append(fragment: string): void {
    this.frameBytes += Buffer.byteLength(fragment, 'utf8');
    if (this.frameBytes > MAX_FRAME_BYTES) throw new RuntimeClientError('runtime_frame_limit');
    this.line += fragment;
  }

  private consumeLine(): RuntimeEvent | null {
    const line = this.line;
    this.line = '';
    this.frameBytes += 1;
    if (this.frameBytes > MAX_FRAME_BYTES) throw new RuntimeClientError('runtime_frame_limit');
    if (!line) return this.consumeFrame();
    if (line.startsWith(':')) return null;
    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    const rawValue = separator < 0 ? '' : line.slice(separator + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'id') this.sourceId = value;
    if (field === 'event') this.event = value;
    if (field === 'data') this.data.push(value);
    return null;
  }

  private consumeFrame(): RuntimeEvent | null {
    const sourceId = this.sourceId;
    const event = this.event;
    const data = this.data;
    this.frameBytes = 0;
    this.sourceId = '';
    this.event = 'message';
    this.data = [];
    if (data.length === 0) return null;
    if (!sourceId) {
      throw new RuntimeClientError(
        event === 'error' ? 'runtime_stream_interrupted' : 'runtime_source_id_missing',
      );
    }
    validateNativePosition(sourceId);
    if (!event || event.length > 128 || hasControlOrSpace(event)) {
      throw new RuntimeClientError('runtime_event_invalid');
    }
    try {
      return { id: sourceId, event, data: JSON.parse(data.join('\n')) as unknown };
    } catch {
      throw new RuntimeClientError('runtime_event_invalid');
    }
  }
}

export async function* readRuntimeEvents(
  response: Response,
  budget: RuntimeRequestBudget,
): AsyncIterable<RuntimeEvent> {
  if (
    response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
      'text/event-stream' ||
    !response.body
  ) {
    void response.body?.cancel().catch(() => undefined);
    throw new RuntimeClientError('runtime_response_invalid');
  }
  const reader = response.body.getReader();
  const parser = new RuntimeFrameParser();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  budget.arm(RUNTIME_STREAM_IDLE_MS, 'runtime_stream_timeout');
  try {
    while (true) {
      const part = await readRuntimeChunk(reader, budget);
      if (part.done) break;
      if (part.value.byteLength > 0) budget.arm(RUNTIME_STREAM_IDLE_MS, 'runtime_stream_timeout');
      let text: string;
      try {
        text = decoder.decode(part.value, { stream: true });
      } catch {
        throw new RuntimeClientError('runtime_event_invalid');
      }
      yield* parser.push(text);
    }
    try {
      yield* parser.push(decoder.decode());
    } catch (error) {
      if (error instanceof RuntimeClientError) throw error;
      throw new RuntimeClientError('runtime_event_invalid');
    }
    parser.finish();
  } finally {
    // A peer that never acknowledges cancellation must not hold the execution lease indefinitely.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
