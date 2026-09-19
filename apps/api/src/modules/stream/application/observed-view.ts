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

/** Distinct committed revisions whose work log is kept; beyond it the oldest is dropped. */
const WORK_CACHE_ENTRIES = 256;

/**
 * Work logs by committed revision, shared by every observer of this instance: observers of one
 * execution re-read the same revision every poll, and building the log is linear in its steps.
 * The key names everything the log depends on, so a hit is the log that would be built.
 */
export class ObservedWorkCache {
  private readonly entries = new Map<string, ObservedWork>();

  get(key: string, build: () => ObservedWork): ObservedWork {
    const hit = this.entries.get(key);
    if (hit !== undefined) return hit;
    const work = build();
    if (this.entries.size >= WORK_CACHE_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, work);
    return work;
  }
}

/**
 * Public view of one committed projection. Rows written before the reducer existed keep their
 * saved text under a synthetic message identifier derived from the execution id only.
 */
export function observedView(loaded: Loaded, works?: ObservedWorkCache): ObservedView {
  const execution = toExecutionDto(loaded.row);
  const settled = isExecutionSettled(loaded.row);
  const endedAt = settled ? (loaded.row.finishedAt?.getTime() ?? null) : null;
  const state = { execution, conversation: loaded.conversation, userMessage: loaded.userMessage };
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
  const key = JSON.stringify([
    loaded.row.id,
    loaded.state.sequence,
    loaded.state.lastEventDigest,
    settled,
    endedAt,
  ]);
  const work = works === undefined ? build() : works.get(key, build);
  return {
    state,
    answer: projectionMessages(loaded.state).at(-1) ?? null,
    steps: work.steps,
    omittedSteps: work.omittedSteps,
    settled,
  };
}
