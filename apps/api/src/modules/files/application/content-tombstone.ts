import type { Logger } from '@nestjs/common';

import type { ArtifactContentStore } from '../domain/content-store.port';

export interface WrittenContent {
  readonly contentId: string;
  readonly tenantId: string;
  readonly ownerUserId: string;
  readonly role: 'original' | 'derivative';
  readonly backend: 'local' | 's3';
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

interface Queryable {
  query(sql: string, parameters: unknown[]): Promise<unknown>;
}

/**
 * Called after bytes were written under a content that was then not published. The store has no
 * listing (ALF-DEC-029), so bytes without a row are personal data nothing can ever find again: a
 * deletion attempted here and failing would lose them for good. The deletion is therefore made
 * durable instead of being attempted: one statement leaves a `purging` row — inserted when the
 * row is gone, flipped back when a late write landed under a content already `purged` — and the
 * collector deletes the bytes, retrying at every sweep until the store accepts. Any other state
 * is already the collector's (`pending`, `failed`, `purging`) or a published file (`ready`), and
 * is left untouched.
 *
 * Only if PostgreSQL itself refuses the tombstone is the object deleted directly, as a last
 * resort; both failing together is logged as an error with the identity to remove by hand.
 */
export async function entombUnpublished(
  db: Queryable,
  store: ArtifactContentStore,
  logger: Logger,
  written: WrittenContent,
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO "api_artifact_contents"
         ("id", "tenant_id", "owner_user_id", "role", "backend", "media_type", "size_bytes", "sha256", "state")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'purging')
       ON CONFLICT ("id") DO UPDATE SET "state" = 'purging', "expires_at" = NULL, "updated_at" = now()
         WHERE "api_artifact_contents"."state" = 'purged'`,
      [
        written.contentId,
        written.tenantId,
        written.ownerUserId,
        written.role,
        written.backend,
        written.mediaType,
        written.sizeBytes,
        written.sha256,
      ],
    );
  } catch (recordError) {
    try {
      await store.delete(written.contentId);
    } catch (deleteError) {
      logger.error(
        `Content ${written.contentId} has stored bytes and no record: remove it from the store`,
        deleteError,
      );
    }
    logger.warn(`Content ${written.contentId} could not be recorded: ${String(recordError)}`);
  }
}
