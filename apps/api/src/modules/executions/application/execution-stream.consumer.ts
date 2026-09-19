import { ConfigService } from '@nestjs/config';
import { Inject, Injectable } from '@nestjs/common';
import {
  emptyProjection,
  normalizeProjection,
  projectRuntimeEvent,
  type ProjectionState,
} from '../infrastructure/langgraph/runtime-projection';
import {
  ExecutionFenceLost,
  ExecutionStateStore,
} from '../infrastructure/persistence/execution-state.store';
import type { ExecutionEntity } from '../infrastructure/persistence/execution.entity';
import { DEFAULT_COMMIT_WINDOW, ProjectionCommitter } from './projection-committer';
import { RUNTIME_CLIENT, type RuntimeClient } from './runtime-client.port';

/** Rejoins from the committed watermark that must yield nothing before success becomes `completed`. */
const DRAIN_CONFIRMATION_ROUNDS = 3;
/** Conversation activity is refreshed at most this often while output streams. */
const ACTIVITY_TOUCH_MS = 5_000;

export interface ProcessingContext {
  row: ExecutionEntity;
  replayingTerminal: boolean;
  leaseLost: boolean;
  authorityLost: boolean;
  checking: boolean;
  activityTouchedAt: number;
}

export function restoreProjection(row: ExecutionEntity): ProjectionState {
  return normalizeProjection(row.reducerState) ?? emptyProjection();
}

/** Consumes native replay into bounded durable progress commits; never per token. */
@Injectable()
export class ExecutionStreamConsumer {
  constructor(
    private readonly states: ExecutionStateStore,
    @Inject(RUNTIME_CLIENT) private readonly runtime: RuntimeClient,
    private readonly config: ConfigService,
  ) {}

  /** Projects one native join from the committed watermark; returns how many events changed state. */
  async consume(
    context: ProcessingContext,
    row: ExecutionEntity,
    signal: AbortSignal,
  ): Promise<number> {
    const committer = new ProjectionCommitter(
      (commit) => this.persistProgress(context, row, commit),
      restoreProjection(context.row),
      {
        ms: this.config.get<number>('EXECUTION_COMMIT_WINDOW_MS') ?? DEFAULT_COMMIT_WINDOW.ms,
        chars: DEFAULT_COMMIT_WINDOW.chars,
      },
    );
    let projected = 0;
    try {
      for await (const event of this.runtime.join(row.id, row.invocationId, {
        after: context.row.sourceWatermark,
        signal,
      })) {
        committer.check();
        const prior = committer.head ?? restoreProjection(context.row);
        const projection = projectRuntimeEvent(prior, event, row.invocationId, {
          content: this.config.get<boolean>('EXECUTION_WORK_LOG_CONTENT_ENABLED') ?? true,
        });
        if (projection === prior) continue;
        await committer.accept(projection, event.id);
        projected += 1;
      }
    } finally {
      committer.close();
      // Whatever ended the stream, the projected prefix is durable before any outcome is decided.
      if (!context.leaseLost && !context.authorityLost) await committer.flush();
    }
    return projected;
  }

  /** True only once a rejoin from the watermark yields nothing new within bounded rounds. */
  async confirmDrained(
    context: ProcessingContext,
    row: ExecutionEntity,
    signal: AbortSignal,
  ): Promise<boolean> {
    for (let round = 0; round < DRAIN_CONFIRMATION_ROUNDS; round += 1) {
      if (signal.aborted) return false;
      if ((await this.consume(context, row, signal)) === 0) return true;
    }
    return false;
  }

  private async persistProgress(
    context: ProcessingContext,
    row: ExecutionEntity,
    commit: { projection: ProjectionState; watermark: string; text: string },
  ): Promise<void> {
    const changes = {
      reducerState: { ...commit.projection },
      publicText: commit.text,
      sourceWatermark: commit.watermark,
      projectionRevision: commit.projection.sequence,
    };
    const touch = Date.now() - context.activityTouchedAt >= ACTIVITY_TOUCH_MS;
    const committed = await this.states.updateProjection(
      row,
      changes,
      touch ? row.conversationId : undefined,
    );
    if (!committed) throw new ExecutionFenceLost();
    if (touch) context.activityTouchedAt = Date.now();
    context.row = { ...context.row, ...changes };
  }
}
