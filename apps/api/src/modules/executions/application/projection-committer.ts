import { PROGRESS_COMMIT_BYTES, PROGRESS_COMMIT_INTERVAL_MS } from '../domain/execution-lifecycle';
import {
  projectionActivities,
  projectionText,
  type ProjectionState,
} from '../infrastructure/langgraph/runtime-projection';

/** Bounded loss window between durable commits (ALF-DEC-006 §6: durable progress watermark). */
export interface CommitWindow {
  readonly ms: number;
  readonly chars: number;
}
export const DEFAULT_COMMIT_WINDOW: CommitWindow = {
  ms: PROGRESS_COMMIT_INTERVAL_MS,
  chars: PROGRESS_COMMIT_BYTES,
};

export interface ProjectionCommit {
  readonly projection: ProjectionState;
  readonly watermark: string;
  readonly text: string;
}
export type PersistProjection = (commit: ProjectionCommit) => Promise<void>;

interface Pending {
  readonly projection: ProjectionState;
  readonly watermark: string;
  readonly text: string;
  readonly activities: string;
}

function activityFingerprint(state: ProjectionState): string {
  return JSON.stringify(projectionActivities(state));
}

/**
 * Batches per-event projections into bounded durable commits. A commit happens when the window
 * elapses, when the visible text grew by the configured amount, or immediately when the visible
 * activity set changes. Between commits the head projection lives here; after a failure nothing
 * further is projected until the caller observes the error.
 */
export class ProjectionCommitter {
  private pending: Pending | null = null;
  /** Latest accepted projection not yet durably committed; survives an in-flight commit. */
  private uncommitted: ProjectionState | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inflight: Promise<void> | undefined;
  private failure: { readonly error: unknown } | null = null;
  private committedText: string;
  private committedActivities: string;

  constructor(
    private readonly persist: PersistProjection,
    committed: ProjectionState,
    private readonly window: CommitWindow = DEFAULT_COMMIT_WINDOW,
  ) {
    this.committedText = projectionText(committed);
    this.committedActivities = activityFingerprint(committed);
  }

  /** Projection to reduce the next event against: pending head, or null once everything is committed. */
  get head(): ProjectionState | null {
    return this.uncommitted;
  }

  /** Surfaces a background commit failure before more source events are consumed. */
  check(): void {
    if (this.failure !== null) throw this.failure.error;
  }

  async accept(projection: ProjectionState, watermark: string): Promise<void> {
    this.check();
    if (this.inflight !== undefined) await this.inflight;
    this.check();
    const text = projectionText(projection);
    const activities = activityFingerprint(projection);
    this.pending = { projection, watermark, text, activities };
    this.uncommitted = projection;
    if (
      activities !== this.committedActivities ||
      Math.abs(text.length - this.committedText.length) >= this.window.chars
    ) {
      await this.flush();
      return;
    }
    if (this.timer === undefined) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush().catch((error: unknown) => {
          this.failure = { error };
        });
      }, this.window.ms);
      this.timer.unref();
    }
  }

  /** Commits the pending head, if any, serialized behind a commit already in flight. */
  async flush(): Promise<void> {
    if (this.inflight !== undefined) {
      await this.inflight;
      return this.flush();
    }
    this.check();
    const pending = this.pending;
    if (pending === null) return;
    this.pending = null;
    this.clearTimer();
    this.inflight = this.persist({
      projection: pending.projection,
      watermark: pending.watermark,
      text: pending.text,
    })
      .then(() => {
        this.committedText = pending.text;
        this.committedActivities = pending.activities;
        if (this.pending === null && this.uncommitted === pending.projection)
          this.uncommitted = null;
      })
      .finally(() => {
        this.inflight = undefined;
      });
    await this.inflight;
  }

  /** Stops the window timer; pending state stays available for one final explicit flush. */
  close(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
