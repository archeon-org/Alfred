import type { Logger } from '@nestjs/common';
import { ApiException } from '../../../common/errors/api.exception';
import type { ExecutionLeaseStore } from '../infrastructure/persistence/execution-lease.store';
import {
  ExecutionFenceLost,
  type ExecutionStateStore,
} from '../infrastructure/persistence/execution-state.store';
import type { ExecutionEntity } from '../infrastructure/persistence/execution.entity';
import type { RuntimeClient } from './runtime-client.port';

/** Best-effort native cancellation budget when the fence can no longer be honored. */
const CLEANUP_TIMEOUT_MS = 20_000;

export const LOST_AUTHORITY_ERROR = 'execution_authority_lost';

/** Owner disabled, project or conversation archived, binding replaced: the fence cannot be honored. */
export function isLostAuthority(error: unknown): boolean {
  return (
    error instanceof ExecutionFenceLost ||
    (error instanceof ApiException && error.code === LOST_AUTHORITY_ERROR)
  );
}

export interface LostAuthorityDependencies {
  readonly states: ExecutionStateStore;
  readonly leases: ExecutionLeaseStore;
  readonly runtime: RuntimeClient;
  readonly logger: Logger;
  readonly leaseMs: number;
}

/**
 * The fence error covers a lost lease and lost resource authority alike. Only the lease holder may
 * write; it releases the conversation instead of re-claiming the row after every lease expiry.
 * Returns false when a successor already owns the lease and nothing was written.
 */
export async function abandonLostAuthority(
  row: ExecutionEntity,
  dependencies: LostAuthorityDependencies,
): Promise<boolean> {
  const { states, leases, runtime, logger, leaseMs } = dependencies;
  const held = await leases.renew(row, leaseMs).catch(() => false);
  if (!held) return false;
  try {
    await runtime.cancel(row.id, row.invocationId, AbortSignal.timeout(CLEANUP_TIMEOUT_MS));
  } catch {
    // Runtime resolution usually fails for the same reason; the native run then ends on its own.
  }
  try {
    if (await states.abandon(row, LOST_AUTHORITY_ERROR)) {
      logger.warn(`Execution ${row.id} was abandoned: its owner or scope is unavailable.`);
    }
  } catch {
    // A successor retries under a new fence.
  }
  return true;
}
