import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExecutionRecoveryWorker } from '@api/modules/executions/application/execution-recovery.worker';
import type { ExecutionProcessor } from '@api/modules/executions/application/execution-processor';
import type { ExecutionLeaseStore } from '@api/modules/executions/infrastructure/persistence/execution-lease.store';
import type { ExecutionEntity } from '@api/modules/executions/infrastructure/persistence/execution.entity';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function fixture(count: number, maximum?: number) {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `execution-${index}`,
    conversationId: `conversation-${index}`,
    ownerUserId: 'same-user',
    projectId: 'same-project',
  })) as ExecutionEntity[];
  let next = 0;
  const pending = new Map<string, ReturnType<typeof deferred<void>>>();
  const claim = vi.fn<ExecutionLeaseStore['claim']>(() => Promise.resolve(rows[next++] ?? null));
  const release = vi.fn<ExecutionLeaseStore['release']>().mockResolvedValue(undefined);
  const process = vi.fn<ExecutionProcessor['process']>((row) => {
    const task = deferred<void>();
    pending.set(row.id, task);
    return task.promise;
  });
  const shutdown = vi.fn(() => {
    for (const task of pending.values()) task.resolve();
  });
  const config = {
    get: vi.fn<(key: string) => boolean | number | undefined>((key) => {
      if (key === 'FEATURE_AGENT_RUNTIME_ENABLED') return true;
      if (key === 'EXECUTION_WORKER_CONCURRENCY') return maximum;
      return undefined;
    }),
  };
  const worker = new ExecutionRecoveryWorker(
    { claim, release } as unknown as ExecutionLeaseStore,
    { process, shutdown } as unknown as ExecutionProcessor,
    config as unknown as ConfigService,
  );
  return { worker, rows, pending, claim, release, process, shutdown, config };
}

async function finishTask(f: ReturnType<typeof fixture>, id: string) {
  const task = f.pending.get(id);
  if (task === undefined) throw new Error('The execution has not started.');
  task.resolve();
  await task.promise;
  // Let the asynchronous lease release finish before asking the scheduler for another slot.
  await Promise.resolve();
}

describe('execution recovery worker scheduling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a second conversation while the first conversation is still processing', async () => {
    const f = fixture(2);
    try {
      await f.worker.tick();
      expect(f.process.mock.calls.map(([row]) => row.conversationId)).toEqual([
        'conversation-0',
        'conversation-1',
      ]);
      expect(f.release).not.toHaveBeenCalled();
      await finishTask(f, 'execution-1');
      expect(f.release.mock.calls.map(([row]) => row.id)).toEqual(['execution-1']);
      expect(f.pending.get('execution-0')).toBeDefined();
    } finally {
      await f.worker.onModuleDestroy();
    }
  });

  it('runs four distinct conversations and admits waiting work as each slot becomes free', async () => {
    const f = fixture(6);
    try {
      await f.worker.tick();
      expect(f.process.mock.calls.map(([row]) => row.id)).toEqual([
        'execution-0',
        'execution-1',
        'execution-2',
        'execution-3',
      ]);
      await f.worker.tick();
      expect(f.claim).toHaveBeenCalledTimes(4);
      await finishTask(f, 'execution-2');
      await f.worker.tick();
      expect(f.process.mock.calls.map(([row]) => row.id)).toEqual([
        'execution-0',
        'execution-1',
        'execution-2',
        'execution-3',
        'execution-4',
      ]);
      await finishTask(f, 'execution-4');
      await f.worker.tick();
      expect(f.process).toHaveBeenLastCalledWith(f.rows[5]);
      expect(f.release.mock.calls.map(([row]) => row.id)).toEqual(['execution-2', 'execution-4']);
    } finally {
      await f.worker.onModuleDestroy();
    }
  });

  it('honors a configured concurrency limit without dispatching waiting work early', async () => {
    const f = fixture(3, 2);
    try {
      await f.worker.tick();
      await f.worker.tick();
      expect(f.process).toHaveBeenCalledTimes(2);
      expect(f.claim).toHaveBeenCalledTimes(2);
      await finishTask(f, 'execution-1');
      await f.worker.tick();
      expect(f.process).toHaveBeenLastCalledWith(f.rows[2]);
    } finally {
      await f.worker.onModuleDestroy();
    }
  });

  it.each([
    [1, 2_000],
    [3, 8_000],
    [7, 60_000],
  ])('releases claim %i with a %i ms backoff instead of a fixed retry', async (claims, delay) => {
    const f = fixture(1);
    f.rows[0]!.leaseVersion = claims;
    try {
      await f.worker.tick();
      await finishTask(f, 'execution-0');
      expect(f.release).toHaveBeenCalledExactlyOnceWith(f.rows[0], delay);
    } finally {
      await f.worker.onModuleDestroy();
    }
  });

  it('does not overlap scans when claiming an execution is slow', async () => {
    const f = fixture(2, 2);
    const firstClaim = deferred<ExecutionEntity | null>();
    f.claim.mockImplementationOnce(() => firstClaim.promise);
    const firstScan = f.worker.tick();
    try {
      await f.worker.tick();
      expect(f.claim).toHaveBeenCalledOnce();
      firstClaim.resolve({ ...f.rows[0]!, id: 'slow-claim' });
      await firstScan;
      expect(f.process.mock.calls.map(([row]) => row.id)).toEqual(['slow-claim', 'execution-0']);
      expect(f.claim).toHaveBeenCalledTimes(2);
    } finally {
      firstClaim.resolve(null);
      await firstScan;
      await f.worker.onModuleDestroy();
    }
  });

  it('frees local capacity when lease release fails, leaving expiry to the database', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const f = fixture(2, 1);
    f.release.mockRejectedValueOnce(new Error('synthetic database outage'));
    try {
      await f.worker.tick();
      await finishTask(f, 'execution-0');
      await f.worker.tick();
      expect(f.process).toHaveBeenLastCalledWith(f.rows[1]);
      expect(f.release).toHaveBeenCalledTimes(1);
    } finally {
      await f.worker.onModuleDestroy();
    }
  });

  it('continues scheduling after a failed claim without rejecting its scan', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const f = fixture(1);
    f.claim.mockRejectedValueOnce(new Error('synthetic database outage'));
    try {
      await expect(f.worker.tick()).resolves.toBeUndefined();
      expect(f.process).not.toHaveBeenCalled();
      await f.worker.tick();
      expect(f.process).toHaveBeenCalledOnce();
    } finally {
      await f.worker.onModuleDestroy();
    }
  });

  it('schedules new conversations on later ticks while an earlier execution stays active', async () => {
    vi.useFakeTimers();
    const f = fixture(2, 2);
    f.claim.mockResolvedValueOnce(f.rows[0]!).mockResolvedValueOnce(null);
    f.worker.onModuleInit();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(f.process).toHaveBeenCalledOnce();
      f.claim.mockResolvedValueOnce(f.rows[1]!);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(f.process.mock.calls.map(([row]) => row.id)).toEqual(['execution-0', 'execution-1']);
      expect(f.release).not.toHaveBeenCalled();
    } finally {
      await f.worker.onModuleDestroy();
    }
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.process).toHaveBeenCalledTimes(2);
  });

  it('does not start background work when the runtime feature is disabled', async () => {
    vi.useFakeTimers();
    const f = fixture(1);
    f.config.get.mockImplementation(() => false);
    f.worker.onModuleInit();
    try {
      await vi.advanceTimersByTimeAsync(5_000);
      expect(f.claim).not.toHaveBeenCalled();
    } finally {
      await f.worker.onModuleDestroy();
    }
  });

  it('waits for active processing and lease cleanup before shutdown completes', async () => {
    const f = fixture(2);
    const release = deferred<void>();
    f.release.mockImplementation(() => release.promise);
    await f.worker.tick();
    let stopped = false;
    const stopping = f.worker.onModuleDestroy().then(() => {
      stopped = true;
    });
    try {
      await Promise.resolve();
      expect(f.shutdown).toHaveBeenCalledOnce();
      expect(stopped).toBe(false);
      await f.worker.tick();
      expect(f.process).toHaveBeenCalledTimes(2);
    } finally {
      release.resolve();
      await stopping;
    }
    expect(stopped).toBe(true);
    expect(f.release).toHaveBeenCalledTimes(2);
  });

  it('does not launch an execution when its pending claim completes after shutdown', async () => {
    const f = fixture(1);
    const claim = deferred<ExecutionEntity | null>();
    const release = deferred<void>();
    f.claim.mockImplementationOnce(() => claim.promise);
    f.release.mockImplementationOnce(() => release.promise);
    const scanning = f.worker.tick();
    let stopped = false;
    const stopping = f.worker.onModuleDestroy().then(() => {
      stopped = true;
    });
    try {
      await Promise.resolve();
      await Promise.resolve();
      expect(stopped).toBe(false);
      claim.resolve(f.rows[0]!);
      await Promise.resolve();
      await Promise.resolve();
      expect(f.process).not.toHaveBeenCalled();
      expect(f.release).toHaveBeenCalledWith(f.rows[0], expect.any(Number));
      expect(stopped).toBe(false);
      release.resolve();
      await scanning;
      await stopping;
      expect(stopped).toBe(true);
    } finally {
      claim.resolve(null);
      release.resolve();
      f.shutdown();
      await scanning;
      await stopping;
      await f.worker.onModuleDestroy();
    }
  });
});
