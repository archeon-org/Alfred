import type { FileQuota } from '@alfred/contracts';
import type { EntityManager } from 'typeorm';

import type { OwnerScope } from '../../../common/ownership/owner-scope';
import { UserEntity } from '../../users/user.entity';
import type { FileSettings } from './file-settings';

/**
 * Serializes one owner's allocations across API replicas, as the skills quota does: every byte
 * admission and every name or folder change of a library happens under this row lock.
 */
export async function lockOwner(manager: EntityManager, scope: OwnerScope): Promise<void> {
  await manager.getRepository(UserEntity).findOneOrFail({
    where: { id: scope.ownerUserId, tenantId: scope.tenantId },
    lock: { mode: 'for_no_key_update' },
  });
}

/**
 * The quota ledger is a SUM, never a counter: a counter would need reconciliation after a
 * point-in-time restore (Revision 86), while a sum over an owner's few rows is always right.
 * Original bytes count; a `pending` row is the reservation of an upload in flight and stops
 * counting when it expires. Derived text and reduced images are capped separately and free.
 */
export async function readQuota(
  manager: EntityManager,
  scope: OwnerScope,
  settings: FileSettings,
): Promise<FileQuota> {
  const rows: { used: string; reserved: string }[] = await manager.query(
    `SELECT
       COALESCE(SUM("size_bytes") FILTER (WHERE "state" = 'ready'), 0) AS used,
       COALESCE(SUM("size_bytes") FILTER (WHERE "state" = 'pending' AND "expires_at" > now()), 0) AS reserved
     FROM "api_artifact_contents"
     WHERE "tenant_id" = $1 AND "owner_user_id" = $2 AND "role" = 'original'
       AND "state" IN ('pending', 'ready')`,
    [scope.tenantId, scope.ownerUserId],
  );
  return {
    usedBytes: Number(rows[0]?.used ?? 0),
    reservedBytes: Number(rows[0]?.reserved ?? 0),
    limitBytes: settings.quotaBytesPerUser,
    maxFileBytes: settings.maxFileBytes,
  };
}
