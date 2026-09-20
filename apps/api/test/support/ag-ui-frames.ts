import {
  alfredRunStateSchema,
  type Conversation,
  type Execution,
  type ExecutionActivity,
} from '@alfred/contracts';
import { EventSchemas, EventType, type BaseEvent } from '@ag-ui/core';
import { verifyEvents } from '@ag-ui/client';
import { from, lastValueFrom, toArray } from 'rxjs';

/** Any AG-UI event as validated by the official discriminated schema. */
export type AgUiWireEvent = ReturnType<typeof EventSchemas.parse>;

export type ParsedFrame =
  | { readonly kind: 'agui'; readonly event: AgUiWireEvent; readonly id?: string }
  | { readonly kind: 'error'; readonly data: unknown; readonly id?: string }
  | { readonly kind: 'comment' };

/** One SSE frame text (without its trailing blank line) as Alfred writes it. */
export function parseAgUiFrame(text: string): ParsedFrame | null {
  const lines = text.split(/\r?\n/u).filter((line) => line !== '');
  if (lines.length === 0) return null;
  if (lines.every((line) => line.startsWith(':'))) return { kind: 'comment' };
  let id: string | undefined;
  let name = 'message';
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'id') id = value;
    else if (field === 'event') name = value;
    else if (field === 'data') data.push(value);
  }
  if (data.length === 0) return null;
  const payload: unknown = JSON.parse(data.join('\n'));
  const cursor = id === undefined ? {} : { id };
  if (name === 'error') return { kind: 'error', data: payload, ...cursor };
  if (name !== 'message') throw new Error(`Unexpected SSE event name: ${name}`);
  // Zod 3 schemas from @ag-ui/core: reject any frame that is not a well-formed AG-UI event.
  return { kind: 'agui', event: EventSchemas.parse(payload), ...cursor };
}

/** Splits raw SSE text (possibly several frames per chunk) into parsed frames. */
export function parseAgUiChunks(chunks: readonly string[]): ParsedFrame[] {
  return chunks
    .join('')
    .split(/\n\n/u)
    .map(parseAgUiFrame)
    .filter((frame): frame is ParsedFrame => frame !== null);
}

/** Browser-like reconstruction of one execution from AG-UI frames, one replica per frame. */
export interface ObservedReplica {
  readonly assistantText: string;
  readonly execution: Execution | null;
  readonly conversation: Conversation | null;
  readonly userMessage: string;
  readonly activities: readonly ExecutionActivity[];
  readonly cursor: string | null;
  readonly lifecycle: 'open' | 'finished' | 'error';
  /** How many RUN_STARTED frames were seen: one per attach. */
  readonly runs: number;
  readonly lastError: { readonly message: string; readonly code?: string } | null;
}

const EMPTY: ObservedReplica = {
  assistantText: '',
  execution: null,
  conversation: null,
  userMessage: '',
  activities: [],
  cursor: null,
  lifecycle: 'open',
  runs: 0,
  lastError: null,
};

/** Incremental browser-like reducer: feed frames as they arrive, read the replica after each. */
export class AgUiReplicaBuilder {
  readonly replicas: ObservedReplica[] = [];
  private current: ObservedReplica = EMPTY;
  private messageId: string | null = null;

  push(frame: ParsedFrame): ObservedReplica | null {
    if (frame.kind !== 'agui') return null;
    const { event } = frame;
    const cursor = frame.id ?? this.current.cursor;
    const current = this.current;
    switch (event.type) {
      case EventType.RUN_STARTED:
        this.current = { ...EMPTY, runs: current.runs + 1, cursor };
        this.messageId = null;
        break;
      case EventType.STATE_SNAPSHOT:
        this.current = { ...current, ...alfredRunStateSchema.parse(event.snapshot), cursor };
        break;
      case EventType.TEXT_MESSAGE_START:
        this.messageId = event.messageId;
        this.current = { ...current, assistantText: '', cursor };
        break;
      case EventType.TEXT_MESSAGE_CONTENT:
        if (event.messageId !== this.messageId) throw new Error('Content for an unopened message');
        this.current = { ...current, assistantText: current.assistantText + event.delta, cursor };
        break;
      case EventType.TEXT_MESSAGE_END:
        if (event.messageId !== this.messageId) throw new Error('End for an unopened message');
        this.current = { ...current, cursor };
        break;
      case EventType.TOOL_CALL_START:
        this.current = {
          ...current,
          activities: [
            ...current.activities,
            { id: event.toolCallId, label: event.toolCallName, status: 'running' },
          ],
          cursor,
        };
        break;
      case EventType.TOOL_CALL_RESULT:
        this.current = {
          ...current,
          activities: current.activities.map((activity) =>
            activity.id === event.toolCallId
              ? {
                  ...activity,
                  status:
                    event.content === 'failed' || event.content === 'interrupted'
                      ? event.content
                      : 'completed',
                }
              : activity,
          ),
          cursor,
        };
        break;
      case EventType.RUN_FINISHED:
        this.current = { ...current, lifecycle: 'finished', cursor };
        break;
      case EventType.RUN_ERROR:
        this.current = {
          ...current,
          lifecycle: 'error',
          lastError: {
            message: event.message,
            ...(event.code === undefined ? {} : { code: event.code }),
          },
          cursor,
        };
        break;
      default:
        this.current = { ...current, cursor };
    }
    this.replicas.push(this.current);
    return this.current;
  }
}

export function reduceAgUiFrames(frames: readonly ParsedFrame[]): ObservedReplica[] {
  const builder = new AgUiReplicaBuilder();
  for (const frame of frames) builder.push(frame);
  return builder.replicas;
}

export function agUiEventNames(frames: readonly ParsedFrame[]): string[] {
  return frames.flatMap((frame) => (frame.kind === 'agui' ? [frame.event.type as string] : []));
}

/** Runs the official AG-UI verifier over each attach (RUN_STARTED starts a new pipeline). */
export async function verifyAgUiRuns(frames: readonly ParsedFrame[]): Promise<number> {
  const runs: BaseEvent[][] = [];
  for (const frame of frames) {
    if (frame.kind !== 'agui') continue;
    if (frame.event.type === EventType.RUN_STARTED || runs.length === 0) runs.push([]);
    runs.at(-1)!.push(frame.event);
  }
  for (const events of runs) await lastValueFrom(from(events).pipe(verifyEvents(), toArray()));
  return runs.length;
}
