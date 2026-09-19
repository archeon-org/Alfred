import type { ExecutionObservationService } from '../../executions/application/execution-observation.service';
import { toExecutionDto } from '../../executions/domain/execution';
import { isExecutionSettled } from '../../executions/domain/execution-lifecycle';
import {
  projectionMessages,
  projectionWork,
  type ObservedWork,
} from '../../executions/infrastructure/langgraph/runtime-projection-work';
import type { ObservedView } from './ag-ui-translation';

type Loaded = Awaited<ReturnType<ExecutionObservationService['load']>>;

/** Heap the cached work logs of every execution may occupy together, as `entryBytes` counts it. */
export const WORK_CACHE_MAX_BYTES = 16 * 1024 * 1024;
/** Executions whose log is kept at once, however small: far more than one instance observes. */
export const WORK_CACHE_MAX_ENTRIES = 1_024;
/** A log no observer read for this long is dropped: it outlives the longest reconnect backoff. */
export const WORK_CACHE_IDLE_MS = 30_000;
/** The map entry, its record and the log object: 774 bytes measured, keys included (Node 22). */
const ENTRY_BYTES = 1_024;
/** The object, timestamps and statuses of one step, beside the strings counted one by one. */
const STEP_BYTES = 128;

/** One committed revision of an execution: `key` names everything its work log depends on. */
export interface WorkRevision {
  readonly executionId: string;
  readonly sequence: number;
  readonly key: string;
}

export interface WorkCacheLimits {
  readonly maxBytes?: number;
  readonly maxEntries?: number;
  readonly idleMs?: number;
  readonly now?: () => number;
}

interface CachedWork {
  readonly sequence: number;
  readonly key: string;
  readonly work: ObservedWork;
  readonly bytes: number;
  readAt: number;
}

/**
 * Work logs shared by every observer of this instance: observers of one execution re-read the same
 * revision every poll, and building the log is linear in its steps. Only the latest revision of an
 * execution is kept, since reads only move forward and each observer keeps the view it last sent.
 * The logs stay within a byte budget, where even a log without steps costs its entry, and within
 * a number of executions; the least recently read leaves first, and a log nobody read for a while
 * is dropped. A log larger than the whole budget is never kept.
 */
export class ObservedWorkCache {
  /** By execution, least recently read first. */
  private readonly entries = new Map<string, CachedWork>();
  private retained = 0;
  private readonly maxBytes: number;
  private readonly maxEntries: number;
  private readonly idleMs: number;
  private readonly now: () => number;

  constructor(limits: WorkCacheLimits = {}) {
    this.maxBytes = limits.maxBytes ?? WORK_CACHE_MAX_BYTES;
    this.maxEntries = limits.maxEntries ?? WORK_CACHE_MAX_ENTRIES;
    this.idleMs = limits.idleMs ?? WORK_CACHE_IDLE_MS;
    this.now = limits.now ?? (() => Date.now());
  }

  /** Bytes the kept logs count against the budget. */
  get bytes(): number {
    return this.retained;
  }

  /** Executions whose log is kept. */
  get size(): number {
    return this.entries.size;
  }

  get(revision: WorkRevision, build: () => ObservedWork): ObservedWork {
    const now = this.now();
    this.expire(now);
    const cached = this.entries.get(revision.executionId);
    if (cached?.key === revision.key) {
      cached.readAt = now;
      this.entries.delete(revision.executionId);
      this.entries.set(revision.executionId, cached);
      return cached.work;
    }
    const work = build();
    // A read that raced behind a newer commit never replaces the log other observers read next.
    if (cached !== undefined && cached.sequence > revision.sequence) return work;
    if (cached !== undefined) this.remove(revision.executionId, cached);
    const bytes = entryBytes(revision, work);
    if (bytes > this.maxBytes) return work;
    this.entries.set(revision.executionId, {
      sequence: revision.sequence,
      key: revision.key,
      work,
      bytes,
      readAt: now,
    });
    this.retained += bytes;
    for (const [executionId, entry] of this.entries) {
      if (this.retained <= this.maxBytes && this.entries.size <= this.maxEntries) break;
      this.remove(executionId, entry);
    }
    return work;
  }

  private expire(now: number): void {
    for (const [executionId, entry] of this.entries) {
      if (now - entry.readAt < this.idleMs) return;
      this.remove(executionId, entry);
    }
  }

  private remove(executionId: string, entry: CachedWork): void {
    this.entries.delete(executionId);
    this.retained -= entry.bytes;
  }
}

/**
 * An upper bound of the heap one cached log holds: the fixed cost of its entry, then two bytes per
 * UTF-16 code unit of its keys and of every step string, whatever their actual encoding, plus the
 * fixed part of each step. A log without steps still costs its entry.
 */
export function entryBytes(revision: WorkRevision, work: ObservedWork): number {
  let bytes = ENTRY_BYTES + 2 * (revision.executionId.length + revision.key.length);
  for (const step of work.steps) {
    const texts = [step.id, step.label, step.text, step.specialist, step.parentId, step.messageId];
    bytes += texts.reduce((sum, text) => sum + 2 * (text?.length ?? 0), STEP_BYTES);
  }
  return bytes;
}

/**
 * Public view of one committed projection. Rows written before the reducer existed keep their
 * saved text under a synthetic message identifier derived from the execution id only.
 */
export function observedView(loaded: Loaded, works?: ObservedWorkCache): ObservedView {
  const execution = toExecutionDto(loaded.row);
  const settled = isExecutionSettled(loaded.row);
  const endedAt = settled ? (loaded.row.finishedAt?.getTime() ?? null) : null;
  const state = {
    execution,
    conversation: loaded.conversation,
    userMessage: loaded.userMessage,
    ...(loaded.attachments.length === 0 ? {} : { attachments: loaded.attachments }),
  };
  if (loaded.state.sourceId === null) {
    return {
      state,
      answer:
        loaded.row.publicText === ''
          ? null
          : {
              id: `${loaded.row.id}:answer`,
              text: loaded.row.publicText,
              startedAt: 0,
              finishedAt: 0,
            },
      steps: [],
      omittedSteps: 0,
      settled,
    };
  }
  const build = () =>
    projectionWork(loaded.state, { settled, endedAt, textLimit: Number.POSITIVE_INFINITY });
  const revision = {
    executionId: loaded.row.id,
    sequence: loaded.state.sequence,
    key: JSON.stringify([loaded.state.sequence, loaded.state.lastEventDigest, settled, endedAt]),
  };
  const work = works === undefined ? build() : works.get(revision, build);
  return {
    state,
    answer: projectionMessages(loaded.state).at(-1) ?? null,
    steps: work.steps,
    omittedSteps: work.omittedSteps,
    settled,
  };
}
