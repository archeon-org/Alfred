import type { SseCloseReason } from '../api/sse-writer';
import {
  AgUiTranslationGap,
  type AgUiGapRule,
  type AgUiGapStepKind,
} from './ag-ui-translation-gap';

/**
 * Why one observation (one `GET /api/executions/:id/events` attach) ended:
 *
 * - `terminal`: the lifecycle end (`RUN_FINISHED` / `RUN_ERROR`) was sent.
 * - `legacy_snapshot`: a legacy row was served once, without a lifecycle end.
 * - `client_disconnected`: the browser (or a proxy) closed the connection.
 * - `token_expired`: the verified access token reached its expiry.
 * - `translation_gap`: the projection could not be continued (see {@link AgUiGapRule}).
 * - `slow_consumer`, `frame_too_large`, `invalid_frame`, `transport_error`: the SSE writer's own
 *   bounds or transport failed.
 * - `reauthorization_failed`: the periodic user/session/resource recheck failed or hung.
 * - `load_timeout`: a committed projection read exceeded its bound (before headers too, where the
 *   attach is answered 503 and `opened` is false).
 * - `revision_regressed`: a settled projection carried a lower revision than the one already sent,
 *   which a monotonic worker never commits; the browser re-attaches to the durable row. (A running
 *   row read below that revision is skipped as a stale read.)
 * - `error`: any other exception, identified by its class name only.
 */
export type ObservationEndReason =
  | 'terminal'
  | 'legacy_snapshot'
  | 'client_disconnected'
  | 'token_expired'
  | 'translation_gap'
  | 'slow_consumer'
  | 'frame_too_large'
  | 'invalid_frame'
  | 'transport_error'
  | 'reauthorization_failed'
  | 'load_timeout'
  | 'revision_regressed'
  | 'error';

export interface ObservationEnd {
  readonly reason: ObservationEndReason;
  readonly rule?: AgUiGapRule;
  readonly stepKind?: AgUiGapStepKind;
  readonly errorName?: string;
}

/** One structured line per ended observation: ids, codes, counts and durations only. */
export interface ObservationEndRecord extends ObservationEnd {
  readonly event: 'execution_observation_ended';
  readonly executionId: string;
  readonly durationMs: number;
  readonly events: number;
  readonly bytes: number;
  readonly resumed: boolean;
  /** False when the attach ended before any SSE header was written. */
  readonly opened: boolean;
}

/** A committed projection read exceeded its bound; kept apart from authority failures. */
export class ObservationLoadTimeout extends Error {
  constructor() {
    super('The committed projection read timed out.');
    this.name = 'ObservationLoadTimeout';
  }
}

/** A committed row carried a lower projection revision than the one this attach already sent. */
export class ObservationRevisionRegressed extends Error {
  constructor() {
    super('The committed projection went below the revision already sent.');
    this.name = 'ObservationRevisionRegressed';
  }
}

const EXPECTED: ReadonlySet<ObservationEndReason> = new Set([
  'terminal',
  'legacy_snapshot',
  'client_disconnected',
  'token_expired',
]);

/** Normal ends log at info; everything that forces an unplanned re-attach logs at warn. */
export function observationEndLevel(end: ObservationEnd): 'info' | 'warn' {
  return EXPECTED.has(end.reason) ? 'info' : 'warn';
}

const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;

/** The reason a writer detached by itself; `closed` is the observer's own close, not a cause. */
export function writerEnd(reason: SseCloseReason | null): ObservationEnd | null {
  switch (reason) {
    case 'disconnected':
    case 'aborted':
      return { reason: 'client_disconnected' };
    case 'slow_consumer':
    case 'frame_too_large':
    case 'invalid_frame':
    case 'transport_error':
      return { reason };
    default:
      return null;
  }
}

/** Classifies an exception without keeping its message, which may carry provider or user text. */
export function errorEnd(error: unknown): ObservationEnd {
  if (error instanceof AgUiTranslationGap)
    return { reason: 'translation_gap', rule: error.rule, stepKind: error.stepKind };
  if (error instanceof ObservationLoadTimeout) return { reason: 'load_timeout' };
  if (error instanceof ObservationRevisionRegressed) return { reason: 'revision_regressed' };
  const name = error instanceof Error ? error.constructor.name : typeof error;
  return { reason: 'error', errorName: SAFE_NAME.test(name) ? name : 'Error' };
}

/** The first cause recorded wins; later effects of the same end (the close itself) are ignored. */
export class ObservationEnding {
  private end: ObservationEnd | null = null;

  get current(): ObservationEnd | null {
    return this.end;
  }

  record(end: ObservationEnd | null): void {
    if (this.end === null && end !== null) this.end = end;
  }
}
