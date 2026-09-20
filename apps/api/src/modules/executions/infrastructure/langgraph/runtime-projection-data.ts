import { createHash } from 'node:crypto';
import { EXECUTION_OUTPUT_MAX_LENGTH, EXECUTION_WORK_MAX_STEPS } from '@alfred/contracts';

export const PROJECTION_LIMITS = {
  eventBytes: 512 * 1024,
  messages: 512,
  sourceIdBytes: 256,
  stateBytes: 1024 * 1024,
  /** Recorded steps of the work log (tools, delegations, narration, markers); more are counted. */
  steps: EXECUTION_WORK_MAX_STEPS,
  /** Reasoning and specialist text kept per execution; further content is dropped, not fatal. */
  contentBytes: 256 * 1024,
  // A UTF-8 byte bound is conservative for the public contract's string-length bound.
  textBytes: EXECUTION_OUTPUT_MAX_LENGTH,
} as const;

export type ProjectionErrorCode =
  | 'runtime_event_invalid'
  | 'runtime_failed'
  | 'runtime_interrupted'
  | 'runtime_projection_limit'
  | 'runtime_source_id_missing';

/** Never include provider-controlled error details in this exception. */
export class ProjectionError extends Error {
  constructor(readonly code: ProjectionErrorCode) {
    super(code);
    this.name = 'ProjectionError';
  }
}

export function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function requireRecord(value: unknown): Record<string, unknown> {
  const result = record(value);
  if (result === null) throw new ProjectionError('runtime_event_invalid');
  return result;
}

/** Bound depth/nodes before JSON serialization, then enforce the actual UTF-8 byte budget. */
export function assertBounded(value: unknown, maxBytes: number): void {
  const pending = [{ depth: 0, value }];
  const seen = new Set<object>();
  let nodes = 0;
  let bytes = 0;
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined) break;
    nodes += 1;
    if (nodes > 20_000 || item.depth > 24) throw new ProjectionError('runtime_projection_limit');
    if (typeof item.value === 'string') bytes += Buffer.byteLength(item.value, 'utf8');
    if (bytes > maxBytes) throw new ProjectionError('runtime_projection_limit');
    if (typeof item.value !== 'object' || item.value === null) continue;
    if (seen.has(item.value)) throw new ProjectionError('runtime_event_invalid');
    seen.add(item.value);
    for (const [key, child] of Object.entries(item.value)) {
      bytes += Buffer.byteLength(key, 'utf8');
      pending.push({ depth: item.depth + 1, value: child });
      if (pending.length > 20_000 || bytes > maxBytes) {
        throw new ProjectionError('runtime_projection_limit');
      }
    }
  }
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new ProjectionError('runtime_event_invalid');
  }
  if (serialized === undefined) throw new ProjectionError('runtime_event_invalid');
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new ProjectionError('runtime_projection_limit');
  }
}

export function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    Buffer.byteLength(value, 'utf8') <= PROJECTION_LIMITS.sourceIdBytes &&
    [...value].every((character) => (character.codePointAt(0) ?? 0) >= 32)
  );
}

/** Stable opaque identifiers; native message/tool identifiers never become public IDs. */
export function projectionId(invocationId: string, kind: string, sourceId: string): string {
  return createHash('sha256')
    .update(JSON.stringify([invocationId, kind, sourceId]))
    .digest('hex');
}

/** Hash after assertBounded: preserve semantic equality across JSON object key ordering. */
export function runtimeEventDigest(event: string, data: unknown): string {
  return createHash('sha256')
    .update(canonicalValue([event, data]))
    .digest('hex');
}

/** Native subgraphs suffix their event type with one or more private namespace components. */
export function nativeEventType(event: string): string {
  const parts = event.split('|');
  const type = parts[0];
  if (type === undefined || parts.some((part) => part.length === 0)) {
    throw new ProjectionError('runtime_event_invalid');
  }
  return type;
}

function canonicalValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`;
  const object = requireRecord(value);
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalValue(object[key])}`)
    .join(',')}}`;
}

export function metadataExcludes(value: unknown): boolean {
  const outer = requireRecord(value);
  const metadata = Object.hasOwn(outer, 'metadata') ? requireRecord(outer.metadata) : outer;
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  return (
    tags.some((tag) => ['non-generation', 'non_generation', 'guard'].includes(String(tag))) ||
    (typeof metadata.langgraph_node === 'string' &&
      /\.(?:before|after)_(?:agent|model)$/u.test(metadata.langgraph_node))
  );
}

export function textContent(content: unknown): string {
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((block: unknown) => {
              if (typeof block === 'string') return block;
              const item = record(block);
              return item?.type === 'text' && typeof item.text === 'string' ? item.text : '';
            })
            .join('')
        : '';
  // Preserve visible text, newlines and tabs, while removing transport control characters.
  return [...text]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join('');
}

const SAFE_LABEL = /^[A-Za-z][A-Za-z0-9_. -]{0,63}$/u;

export function safeToolLabel(value: unknown): string {
  return typeof value === 'string' && SAFE_LABEL.test(value) ? value : 'Tool';
}

/** A specialist name as the runtime declares it, or null when it is not a safe label. */
export function safeSpecialist(value: unknown): string | null {
  return typeof value === 'string' && SAFE_LABEL.test(value) ? value : null;
}

/** The runtime's delegation tool; its invocations become delegation steps. */
export const DELEGATION_TOOL = 'task';

/**
 * Native stream positions are `<milliseconds since epoch>-<sequence>`; the millisecond part is the
 * server clock at emission. Any other shape yields null and the caller falls back to its clock.
 */
export function nativeEventTimestamp(id: unknown): number | null {
  if (typeof id !== 'string') return null;
  const match = /^(\d{13})-\d+$/u.exec(id);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

/** First private namespace component of a nested event name, or null at the root. */
export function eventNamespace(event: string): string | null {
  const parts = event.split('|');
  return parts.length > 1 && parts[1] !== undefined && parts[1] !== '' ? parts[1] : null;
}

/** Same as {@link eventNamespace} for a `langgraph_checkpoint_ns` metadata value. */
export function checkpointNamespace(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;
  const first = value.split('|')[0];
  return first === undefined || first === '' ? null : first;
}

/**
 * The hidden reasoning a model chunk carries (provider `reasoning_content` or reasoning content
 * blocks), stripped of control characters; empty when the chunk carries none. Whether the text
 * is kept or only its presence is a projection option.
 */
export function reasoningText(message: Record<string, unknown>): string {
  const parts: string[] = [];
  const extra = record(message.additional_kwargs);
  if (extra !== null) {
    for (const key of ['reasoning_content', 'reasoning']) {
      const value = extra[key];
      if (typeof value === 'string' && value !== '') parts.push(value);
    }
  }
  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      const item = record(block);
      if (item === null) continue;
      const type = String(item.type);
      if (type !== 'reasoning' && type !== 'thinking' && type !== 'reasoning_content') continue;
      const text = item.text ?? item.thinking ?? item.reasoning;
      if (typeof text === 'string' && text !== '') parts.push(text);
    }
  }
  return textContent(parts.join(''));
}

export function containsInterrupt(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsInterrupt);
  const object = record(value);
  if (object === null) return false;
  const interrupt = object.__interrupt__;
  if (interrupt !== undefined && (!Array.isArray(interrupt) || interrupt.length > 0)) return true;
  return Object.values(object).some(containsInterrupt);
}
