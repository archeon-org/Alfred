import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { ARTIFACT_CONTENT_STORE, type ArtifactContentStore } from '../domain/content-store.port';

const SWEEP_INTERVAL_MS = 60_000;
const BATCH = 25;

/**
 * Reference-aware garbage collection (ALF-DEC-054 §6: physical deletion is internal). It removes
 * the bytes of deleted files, of uploads that never completed and of reduced copies nobody owns.
 * Each row is claimed with `FOR UPDATE SKIP LOCKED`, so replicas share the work, and the store's
 * delete is idempotent, so a crash between the delete and the commit only repeats it.
 *
 * A content that was never published leaves in two steps: its expired reservation first becomes
 * `failed`, and ten minutes later the bytes and the row go together. The row is the only record
 * of the bytes (the store has no listing), so it must not disappear while a write may still land
 * under it; every store call is bounded far below that grace period.
 */
@Injectable()
export class FileCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileCollector.name);
  private timer: NodeJS.Timeout | undefined;
  private sweeping: Promise<void> | undefined;
  private stopping = false;

  constructor(
    private readonly db: DataSource,
    @Inject(ARTIFACT_CONTENT_STORE) private readonly store: ArtifactContentStore,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  onModuleInit(): void {
    if (this.flags?.isEnabled('fileUploads') !== true) return;
    this.timer = setInterval(() => {
      this.nudge();
    }, SWEEP_INTERVAL_MS);
    this.timer.unref();
    this.nudge();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    await this.sweeping;
  }

  nudge(): void {
    if (this.sweeping !== undefined || this.stopping) return;
    this.sweeping = this.run()
      .catch((error: unknown) => {
        // A purge that fails is retried at the next sweep; it never extends what is kept.
        this.logger.error('File collection sweep failed', error);
      })
      .finally(() => {
        this.sweeping = undefined;
      });
  }

  /** Waits for the sweep in flight, then collects again: what a test or a tool calls. */
  async sweep(): Promise<void> {
    await this.sweeping;
    await this.run();
  }

  private async run(): Promise<void> {
    // What the store refused during this sweep: left for the next one, never retried in a loop.
    const refused: string[] = [];
    for (let round = 0; round < BATCH && !this.stopping; round += 1) {
      if (!(await this.collectOne(refused))) break;
    }
    if (refused.length > 0) {
      throw new Error(`The store refused to delete ${refused.length} content(s)`);
    }
  }

  private collectOne(refused: string[]): Promise<boolean> {
    return this.db.transaction(async (manager) => {
      const rows: { id: string; state: string }[] = await manager.query(
        `SELECT "id", "state" FROM "api_artifact_contents"
         WHERE ("state" = 'purging'
            OR ("state" = 'pending' AND "expires_at" <= clock_timestamp())
            OR ("state" = 'failed' AND "updated_at" <= clock_timestamp() - interval '10 minutes'))
           AND "id" <> ALL($1::uuid[])
         ORDER BY "updated_at" FOR UPDATE SKIP LOCKED LIMIT 1`,
        [[...refused]],
      );
      const row = rows[0];
      if (row === undefined) return false;

      if (row.state === 'pending') {
        // An expired reservation may still have its writer at work. The store has no listing, so
        // the row must outlive any write made under it: it only stops being a reservation here,
        // and leaves with its bytes after the grace period, which no store write can outlast.
        await manager.query(
          `UPDATE "api_artifact_contents" SET "state" = 'failed', "expires_at" = NULL, "updated_at" = now() WHERE "id" = $1`,
          [row.id],
        );
        return true;
      }

      try {
        await this.store.delete(row.id);
      } catch (error) {
        // One object the store refuses must not hold back every purge queued behind it: the row
        // is kept as it is, skipped for the rest of this sweep and tried again at the next.
        this.logger.warn(`Content ${row.id} could not be deleted: ${String(error)}`);
        refused.push(row.id);
        return true;
      }
      if (row.state === 'purging') {
        // Kept as a record: revisions and attachments still point at this content identity.
        await manager.query(
          `UPDATE "api_artifact_contents" SET "state" = 'purged', "purged_at" = now(), "updated_at" = now() WHERE "id" = $1`,
          [row.id],
        );
      } else {
        // An upload that never published has no revision: nothing references the row.
        await manager.query('DELETE FROM "api_artifact_contents" WHERE "id" = $1', [row.id]);
      }
      return true;
    });
  }
}
