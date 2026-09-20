import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExecutionStatus } from '@alfred/contracts';
import { EXECUTION_LEASE_MS } from '../domain/execution-lifecycle';
import { ProjectionError } from '../infrastructure/langgraph/runtime-projection';
import { ExecutionLeaseStore } from '../infrastructure/persistence/execution-lease.store';
import {
  ExecutionFenceLost,
  ExecutionStateStore,
} from '../infrastructure/persistence/execution-state.store';
import type { ExecutionEntity } from '../infrastructure/persistence/execution.entity';
import { abandonLostAuthority, isLostAuthority } from './execution-lost-authority';
import {
  ExecutionStreamConsumer,
  restoreProjection,
  type ProcessingContext,
} from './execution-stream.consumer';
import { requestConversationTitle } from './execution-title';
import {
  RUNTIME_CLIENT,
  RUNTIME_NOT_DISPATCHED,
  RuntimeClientError,
  type RuntimeClient,
  type RuntimeRun,
} from './runtime-client.port';

const TERMINAL_RUNTIME = new Set(['success', 'error', 'interrupted', 'timeout']);
/** Final inspection or cancellation after the stream ended runs on its own budget. */
const OUTCOME_TIMEOUT_MS = 20_000;

/** Owns one leased invocation. Browser signals never enter this worker. */
@Injectable()
export class ExecutionProcessor {
  private readonly logger = new Logger(ExecutionProcessor.name);
  private readonly controllers = new Set<AbortController>();

  constructor(
    private readonly states: ExecutionStateStore,
    private readonly leases: ExecutionLeaseStore,
    @Inject(RUNTIME_CLIENT) private readonly runtime: RuntimeClient,
    private readonly config: ConfigService,
    private readonly consumer: ExecutionStreamConsumer,
  ) {}

  shutdown(): void {
    for (const controller of this.controllers) controller.abort();
  }

  async process(initial: ExecutionEntity): Promise<void> {
    const controller = new AbortController();
    this.controllers.add(controller);
    const context: ProcessingContext = {
      row: initial,
      replayingTerminal: false,
      leaseLost: false,
      authorityLost: false,
      checking: false,
      activityTouchedAt: 0,
    };
    const timer = setInterval(() => {
      void this.checkLease(context, controller);
    }, 5_000);
    timer.unref();
    try {
      const row = initial;
      if (row.dispatchState === 'pending' && this.mustStop(row)) {
        await this.finish(row, this.expired(row) ? 'timed_out' : 'cancelled');
        return;
      }
      if (this.expired(row)) {
        // Past its deadline in any state the row stops reserving its conversation. No native
        // outcome is invented: the run is cancelled best-effort here and a replacement dispatch
        // interrupts whatever may still linger on the thread.
        await this.cancelQuietly(row);
        await this.finish(row, 'timed_out', 'execution_deadline_exceeded');
        return;
      }
      if (row.status === 'recovery_required') {
        const outcome = await this.runtime.cancel(row.id, row.invocationId, controller.signal);
        this.assertIdentity(row, outcome);
        if (TERMINAL_RUNTIME.has(outcome.status))
          await this.states.update(row, { finishedAt: new Date() });
        return;
      }
      const run = await this.resolveRun(context, controller.signal);
      if (run === null) return;
      requestConversationTitle(row, this.runtime, this.states);
      context.replayingTerminal = TERMINAL_RUNTIME.has(run.status);
      let drained = false;
      try {
        await this.consumer.consume(context, row, controller.signal);
        drained = true;
      } catch (error) {
        if (await this.parkStreamFailure(context, row, error, controller)) return;
      }
      if (context.leaseLost) return;
      if (context.authorityLost) throw new ExecutionFenceLost();
      // EOF has no outcome semantics. Inspect the original native run before completing.
      const fresh = await this.states.load(row.id);
      if (fresh === null) return;
      const signal = AbortSignal.timeout(OUTCOME_TIMEOUT_MS);
      const outcome =
        this.mustStop(fresh) && !TERMINAL_RUNTIME.has(run.status)
          ? await this.runtime.cancel(row.id, row.invocationId, signal)
          : await this.runtime.inspect(row.id, row.invocationId, signal);
      this.assertIdentity(row, outcome);
      if (outcome.status === 'success' && drained) {
        // A clean stream end proves nothing about delivery. Only a rejoin from the committed
        // watermark that yields no further source event confirms the projection holds the answer.
        context.replayingTerminal = true;
        try {
          drained = await this.consumer.confirmDrained(context, row, controller.signal);
        } catch (error) {
          if (await this.parkStreamFailure(context, row, error, controller)) return;
          drained = false;
        }
        if (context.leaseLost) return;
        if (context.authorityLost) throw new ExecutionFenceLost();
      }
      const settled =
        context.row.projectionRevision > fresh.projectionRevision ? context.row : fresh;
      await this.reconcile(settled, outcome, drained);
    } catch (error) {
      if (context.leaseLost) return;
      if (isLostAuthority(error)) {
        await this.abandon(initial, context);
        return;
      }
      // Leave the last committed source position intact. A successor retries under a new fence.
      this.logger.warn(`Execution ${initial.id} awaits recovery.`);
      try {
        const missingReplay =
          error instanceof RuntimeClientError && /gap|expired|replay/.test(error.code);
        const needsRecovery = missingReplay || this.expired(initial);
        // Local work failed before any run creation was requested: nothing exists natively, so
        // the successor dispatches again instead of inspecting a run that was never created.
        const notDispatched =
          error instanceof RuntimeClientError && error.code === RUNTIME_NOT_DISPATCHED;
        await this.states.update(initial, {
          ...(notDispatched ? { dispatchState: 'pending' as const } : {}),
          status:
            initial.status === 'recovery_required' || needsRecovery
              ? 'recovery_required'
              : initial.stopRequestedAt === null
                ? 'recovering'
                : 'stopping',
          ...(needsRecovery
            ? {
                error: missingReplay ? 'runtime_recovery_gap' : 'execution_deadline_exceeded',
                stopRequestedAt: initial.stopRequestedAt ?? new Date(),
              }
            : {}),
        });
      } catch (persistError) {
        // No fabricated public terminal event when persistence is unavailable. When the fence
        // itself is gone, release the conversation instead of retrying forever.
        if (isLostAuthority(persistError)) await this.abandon(initial, context);
      }
    } finally {
      clearInterval(timer);
      controller.abort();
      this.controllers.delete(controller);
    }
  }

  private async resolveRun(
    context: ProcessingContext,
    signal: AbortSignal,
  ): Promise<RuntimeRun | null> {
    const row = context.row;
    let run: RuntimeRun;
    if (row.dispatchState === 'pending') {
      context.row = await this.states.update(row, {
        dispatchState: 'dispatching',
        status: 'running',
        startedAt: new Date(),
      });
      run = await this.runtime.dispatch(row.id, row.invocationId, signal);
    } else {
      // A missing response or search result cannot prove that native creation was rejected.
      // Preserve this invocation and reconcile it instead of risking duplicate work.
      run = await this.runtime.inspect(row.id, row.invocationId, signal);
    }
    this.assertIdentity(row, run);
    if (this.mustStop(row)) run = await this.runtime.cancel(row.id, row.invocationId, signal);
    this.assertIdentity(row, run);
    if (run.runId === null || ['dispatching', 'unresolved'].includes(run.status)) {
      const expired = this.expired(row);
      await this.states.update(row, {
        dispatchState: 'unknown',
        status: expired
          ? 'recovery_required'
          : row.stopRequestedAt === null
            ? 'recovering'
            : 'stopping',
        ...(expired
          ? {
              error: 'execution_deadline_exceeded',
              stopRequestedAt: row.stopRequestedAt ?? new Date(),
            }
          : {}),
      });
      return null;
    }
    if (!run.replayAvailable && run.status === 'success') {
      await this.states.update(row, {
        status: 'recovery_required',
        error: 'runtime_recovery_gap',
        finishedAt: new Date(),
      });
      return null;
    }
    context.row = await this.states.update(row, {
      runtimeRunId: run.runId,
      dispatchState: 'accepted',
      status: 'running',
    });
    return run;
  }

  /** Parks unrecoverable source failures; returns true when processing must end here. */
  private async parkStreamFailure(
    context: ProcessingContext,
    row: ExecutionEntity,
    error: unknown,
    controller: AbortController,
  ): Promise<boolean> {
    if (context.leaseLost) return true;
    if (
      error instanceof ProjectionError &&
      !['runtime_interrupted', 'runtime_failed'].includes(error.code)
    ) {
      await this.states.update(row, {
        status: 'recovery_required',
        error: error.code,
        stopRequestedAt: new Date(),
      });
      return true;
    }
    if (error instanceof RuntimeClientError && /gap|expired|replay/.test(error.code)) {
      await this.states.update(row, {
        status: 'recovery_required',
        error: 'runtime_recovery_gap',
        stopRequestedAt: new Date(),
      });
      return true;
    }
    if (!(error instanceof ProjectionError) && !controller.signal.aborted) throw error;
    return false;
  }

  private async reconcile(row: ExecutionEntity, run: RuntimeRun, drained: boolean): Promise<void> {
    if (run.status === 'success' && drained) {
      const projection = restoreProjection(row);
      const lastMessage = projection.messageOrder.findLast(
        (id) => !projection.excluded.includes(id),
      );
      const unclassified =
        lastMessage !== undefined && projection.visibility[lastMessage] !== 'allowed';
      // Only sub-graph text was seen: withholding it (ALF-DEC-037) must not read as a blank success.
      const withheldOnly = lastMessage === undefined && projection.hiddenText === true;
      if (unclassified || withheldOnly) {
        await this.states.update(row, {
          status: 'recovery_required',
          error: 'runtime_output_incomplete',
          finishedAt: new Date(),
        });
      } else await this.finish(row, 'completed');
      return;
    }
    if (run.status === 'error') {
      await this.finish(row, 'failed', 'runtime_failed');
      return;
    }
    if (run.status === 'timeout') {
      await this.finish(row, 'timed_out', 'execution_deadline_exceeded');
      return;
    }
    if (run.status === 'interrupted') {
      if (this.expired(row)) await this.finish(row, 'timed_out', 'execution_deadline_exceeded');
      else if (row.stopRequestedAt !== null) await this.finish(row, 'cancelled');
      else await this.states.update(row, { status: 'interrupted', error: 'runtime_interrupted' });
      return;
    }
    await this.states.update(row, {
      status: row.stopRequestedAt === null ? 'recovering' : 'stopping',
    });
  }

  private async finish(
    row: ExecutionEntity,
    status: ExecutionStatus,
    error: string | null = null,
  ): Promise<void> {
    await this.states.update(row, {
      status,
      error,
      finishedAt: new Date(),
      publicText: row.publicText,
    });
  }

  private async abandon(row: ExecutionEntity, context: ProcessingContext): Promise<void> {
    const written = await abandonLostAuthority(row, {
      states: this.states,
      leases: this.leases,
      runtime: this.runtime,
      logger: this.logger,
      leaseMs: this.leaseMs(),
    });
    if (!written) context.leaseLost = true;
  }

  private assertIdentity(row: ExecutionEntity, run: RuntimeRun): void {
    if (
      run.executionId !== row.id ||
      run.invocationId !== row.invocationId ||
      run.threadId !== row.runtimeThreadId ||
      (row.runtimeRunId !== null && run.runId !== null && run.runId !== row.runtimeRunId)
    ) {
      throw new RuntimeClientError('runtime_identity_mismatch');
    }
  }

  private async cancelQuietly(row: ExecutionEntity): Promise<void> {
    try {
      await this.runtime.cancel(row.id, row.invocationId, AbortSignal.timeout(OUTCOME_TIMEOUT_MS));
    } catch {
      // The replacement dispatch interrupts a lingering run; nothing is claimed here.
    }
  }

  private expired(row: ExecutionEntity): boolean {
    return row.deadlineAt.getTime() <= Date.now();
  }
  private mustStop(row: ExecutionEntity): boolean {
    return row.stopRequestedAt !== null || this.expired(row);
  }
  private leaseMs(): number {
    return this.config.get<number>('EXECUTION_LEASE_MS') ?? EXECUTION_LEASE_MS;
  }

  private async checkLease(context: ProcessingContext, controller: AbortController): Promise<void> {
    if (context.checking) return;
    context.checking = true;
    try {
      const renewed = await this.leases.renew(context.row, this.leaseMs());
      if (!renewed) {
        context.leaseLost = true;
        controller.abort();
        return;
      }
      const fresh = await this.states.load(context.row.id);
      if (fresh === null) {
        context.leaseLost = true;
        controller.abort();
        return;
      }
      if (!(await this.states.authorityHolds(fresh))) {
        // Owner, project, conversation or binding gone: stop streaming and release the row.
        context.authorityLost = true;
        controller.abort();
        return;
      }
      if (!context.replayingTerminal && this.mustStop(fresh)) controller.abort();
    } catch {
      context.leaseLost = true;
      controller.abort();
    } finally {
      context.checking = false;
    }
  }
}
