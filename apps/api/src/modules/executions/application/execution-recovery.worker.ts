import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EXECUTION_LEASE_MS,
  EXECUTION_RETRY_MS,
  retryDelayMs,
} from '../domain/execution-lifecycle';
import { ExecutionLeaseStore } from '../infrastructure/persistence/execution-lease.store';
import { ExecutionProcessor } from './execution-processor';

/** Bounded background recovery runs without an observer and coordinates replicas through PostgreSQL. */
@Injectable()
export class ExecutionRecoveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly owner = randomUUID();
  private readonly logger = new Logger(ExecutionRecoveryWorker.name);
  private readonly active = new Set<Promise<void>>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private scanning: Promise<void> | undefined;
  private stopping = false;

  constructor(
    private readonly leases: ExecutionLeaseStore,
    private readonly processor: ExecutionProcessor,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('FEATURE_AGENT_RUNTIME_ENABLED')) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 1_000);
    this.timer.unref();
    void this.tick();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    this.processor.shutdown();
    await this.scanning;
    await Promise.allSettled([...this.active]);
  }

  tick(): Promise<void> {
    if (this.scanning !== undefined || this.stopping) return Promise.resolve();
    this.scanning = this.scan();
    return this.scanning.finally(() => {
      this.scanning = undefined;
    });
  }

  private async scan(): Promise<void> {
    try {
      const maximum = this.config.get<number>('EXECUTION_WORKER_CONCURRENCY') ?? 4;
      while (this.active.size < maximum && !this.stopping) {
        const row = await this.leases.claim(
          this.owner,
          this.config.get<number>('EXECUTION_LEASE_MS') ?? EXECUTION_LEASE_MS,
        );
        if (row === null) break;
        // Shutdown may start while PostgreSQL is claiming this row. Return the lease before
        // teardown completes, without starting native work after the processor was stopped.
        if (this.stopping) {
          await this.leases.release(row, EXECUTION_RETRY_MS);
          break;
        }
        const task = this.processor.process(row).finally(async () => {
          try {
            // Each claim increments the lease version; repeated claims back off up to one minute.
            await this.leases.release(row, retryDelayMs(row.leaseVersion));
          } catch {
            this.logger.warn('Execution lease release awaits expiry.');
          }
          this.active.delete(task);
        });
        this.active.add(task);
      }
    } catch {
      this.logger.warn('Execution recovery scan is temporarily unavailable.');
    }
  }
}
