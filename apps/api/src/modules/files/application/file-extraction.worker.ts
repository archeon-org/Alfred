import { randomUUID } from 'node:crypto';

import type { FileFailureCode, FileKind } from '@alfred/contracts';
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
import { sha256Of } from '../domain/content-digest';
import { ARTIFACT_CONTENT_STORE, type ArtifactContentStore } from '../domain/content-store.port';
import {
  EXTRACTION_RUNNER,
  type ExtractionResult,
  type ExtractionRunner,
} from '../domain/extraction.port';
import { entombUnpublished, type WrittenContent } from './content-tombstone';
import { FILE_SETTINGS, type FileSettings } from './file-settings';

interface ClaimedJob {
  readonly contentId: string;
  readonly kind: FileKind;
  readonly attempts: number;
  readonly tenantId: string;
  readonly ownerUserId: string;
  readonly backend: 'local' | 's3';
}

const POLL_INTERVAL_MS = 2_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15_000;
/** Beyond the extraction deadline, so a live job never loses its lease to another replica. */
const LEASE_MARGIN_MS = 30_000;

/**
 * Drains the extraction queue kept in PostgreSQL (ALF-DEC-054 "transactional outbox jobs"). A job
 * is claimed with `FOR UPDATE SKIP LOCKED` and a lease, exactly as executions are, so any number
 * of API replicas share the queue, and a replica that dies leaves a job another one resumes. It
 * runs off the request path: an upload answers as soon as the bytes are stored.
 */
@Injectable()
export class FileExtractionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileExtractionWorker.name);
  private readonly owner = `extraction-${randomUUID()}`;
  private timer: NodeJS.Timeout | undefined;
  private draining: Promise<void> | undefined;
  private stopping = false;

  constructor(
    private readonly db: DataSource,
    @Inject(ARTIFACT_CONTENT_STORE) private readonly store: ArtifactContentStore,
    @Inject(EXTRACTION_RUNNER) private readonly runner: ExtractionRunner,
    @Inject(FILE_SETTINGS) private readonly settings: FileSettings,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  onModuleInit(): void {
    if (this.flags?.isEnabled('fileUploads') !== true) return;
    this.timer = setInterval(() => {
      this.nudge();
    }, POLL_INTERVAL_MS);
    this.timer.unref();
    this.nudge();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    await this.draining;
  }

  /** Called after an upload so that a small file is ready before the user finishes typing. */
  nudge(): void {
    if (this.draining !== undefined || this.stopping) return;
    this.draining = this.run()
      .catch((error: unknown) => {
        this.logger.error('Extraction queue scan failed', error);
      })
      .finally(() => {
        this.draining = undefined;
      });
  }

  /** Waits for the scan in flight, then empties the queue: what a test or a tool calls. */
  async drain(): Promise<void> {
    await this.draining;
    await this.run();
  }

  /** Runs queued jobs one at a time until the queue is empty. */
  private async run(): Promise<void> {
    while (!this.stopping) {
      const job = await this.claim();
      if (job === null) return;
      await this.process(job);
    }
  }

  private async claim(): Promise<ClaimedJob | null> {
    const leaseMs = this.settings.extractionTimeoutMs + LEASE_MARGIN_MS;
    const rows: {
      content_id: string;
      kind: FileKind;
      attempts: number;
      tenant_id: string;
      owner_user_id: string;
      backend: 'local' | 's3';
    }[] = await this.db.query(
      `WITH candidate AS (
         SELECT "content_id" FROM "api_artifact_extractions"
         WHERE "state" IN ('queued', 'running') AND "next_attempt_at" <= clock_timestamp()
           AND ("lease_expires_at" IS NULL OR "lease_expires_at" <= clock_timestamp())
         ORDER BY "next_attempt_at" FOR UPDATE SKIP LOCKED LIMIT 1
       ), claimed AS (
         UPDATE "api_artifact_extractions" e SET "state" = 'running', "lease_owner" = $1,
           "attempts" = e."attempts" + 1, "updated_at" = now(),
           "lease_expires_at" = clock_timestamp() + $2 * interval '1 millisecond'
         FROM candidate WHERE e."content_id" = candidate."content_id"
         RETURNING e."content_id", e."kind", e."attempts"
       )
       SELECT claimed.*, c."tenant_id", c."owner_user_id", c."backend"
       FROM claimed JOIN "api_artifact_contents" c ON c."id" = claimed."content_id"`,
      [this.owner, leaseMs],
    );
    const row = rows[0];
    if (row === undefined) return null;
    return {
      contentId: row.content_id,
      kind: row.kind,
      attempts: row.attempts,
      tenantId: row.tenant_id,
      ownerUserId: row.owner_user_id,
      backend: row.backend,
    };
  }

  private async process(job: ClaimedJob): Promise<void> {
    let result: ExtractionResult;
    try {
      const bytes = await this.store.get(job.contentId);
      if (bytes === null) return await this.missingBytes(job);
      result = await this.runner.run(
        {
          kind: job.kind,
          bytes,
          limits: {
            maxPdfPages: this.settings.maxPdfPages,
            maxChars: this.settings.maxExtractedChars,
            imageMaxEdgePx: this.settings.imageMaxEdgePx,
            imageMaxInputPixels: this.settings.imageMaxInputPixels,
          },
        },
        this.settings.extractionTimeoutMs,
      );
    } catch (error) {
      // The store or the runner itself failed: the document is not at fault, so try again.
      this.logger.warn(`Extraction of ${job.contentId} could not run: ${String(error)}`);
      return this.fail(job, 'parser_error', job.attempts < MAX_ATTEMPTS);
    }

    if (result.status === 'failed') return this.fail(job, result.failureCode, false);
    try {
      if (result.status === 'text') await this.publishText(job, result);
      else await this.publishImage(job, result.derivative, result.mediaType);
    } catch (error) {
      // The database or the store failed while publishing: the document is not at fault either.
      // Without this the job would stay `running` until its lease expired, then start over with
      // no limit on attempts.
      this.logger.warn(`Extraction of ${job.contentId} could not be published: ${String(error)}`);
      return this.fail(job, 'parser_error', job.attempts < MAX_ATTEMPTS);
    }
  }

  /**
   * Every transaction of this worker takes the catalog row first, as a deletion does, so that the
   * two never wait for each other in opposite orders.
   */
  private async lockFile(
    manager: { query(sql: string, parameters: unknown[]): Promise<unknown[]> },
    contentId: string,
  ): Promise<void> {
    await manager.query(
      `SELECT a."id" FROM "api_artifacts" a
       JOIN "api_artifact_revisions" r ON r."artifact_id" = a."id"
       WHERE r."content_id" = $1 FOR UPDATE OF a`,
      [contentId],
    );
  }

  /**
   * No bytes under a content identity means one of two things. The owner deleted the file while
   * the job waited: the row says so and the job simply ends. Otherwise this replica does not see
   * what another one stored — replicas that share this queue must share one store — and the job
   * is retried rather than condemning a file nobody could read.
   */
  private async missingBytes(job: ClaimedJob): Promise<void> {
    const rows: { state: string }[] = await this.db.query(
      `SELECT "state" FROM "api_artifact_contents" WHERE "id" = $1`,
      [job.contentId],
    );
    const deleted = rows[0] === undefined || rows[0].state !== 'ready';
    if (!deleted) this.logger.warn(`Stored bytes of ${job.contentId} are not visible here`);
    return this.fail(job, 'parser_error', !deleted && job.attempts < MAX_ATTEMPTS);
  }

  /**
   * Publication is fenced by the lease owner, and by the file still existing: a late worker can
   * never republish content for a file that was deleted meanwhile (Revision 86).
   */
  private async publishText(
    job: ClaimedJob,
    result: Extract<ExtractionResult, { status: 'text' }>,
  ): Promise<void> {
    await this.db.transaction(async (manager) => {
      await this.lockFile(manager, job.contentId);
      const updated: unknown[] = await manager.query(
        `WITH done AS (UPDATE "api_artifact_extractions" SET "state" = 'ready', "text" = $3,
             "char_count" = $4, "page_count" = $5, "truncated" = $6, "failure_code" = NULL,
             "lease_owner" = NULL, "lease_expires_at" = NULL, "updated_at" = now()
           WHERE "content_id" = $1 AND "lease_owner" = $2 AND "state" = 'running'
           RETURNING "content_id") SELECT "content_id" FROM done`,
        [
          job.contentId,
          this.owner,
          result.text,
          result.text.length,
          result.pageCount,
          result.truncated,
        ],
      );
      if (updated.length !== 1) return;
      await this.settle(manager, job.contentId, 'ready', null, result.pageCount);
    });
  }

  /**
   * The reduced copy is recorded before it exists. The store has no listing (ALF-DEC-029), so an
   * object written first and recorded second would, after a crash in between, be personal data
   * that neither the collector nor a deletion could ever find. A `pending` row is a reservation
   * with a deadline: if this worker dies, the collector removes the row and whatever bytes were
   * written under it. Publication then happens in one transaction, fenced by the lease.
   */
  private async publishImage(
    job: ClaimedJob,
    derivative: Buffer,
    mediaType: string,
  ): Promise<void> {
    const written: WrittenContent = {
      contentId: randomUUID(),
      tenantId: job.tenantId,
      ownerUserId: job.ownerUserId,
      role: 'derivative',
      backend: job.backend,
      mediaType,
      sizeBytes: derivative.byteLength,
      sha256: sha256Of(derivative),
    };
    const derivativeId = written.contentId;
    await this.db.query(
      `INSERT INTO "api_artifact_contents"
         ("id", "tenant_id", "owner_user_id", "role", "backend", "media_type", "size_bytes", "sha256", "state", "expires_at")
       VALUES ($1, $2, $3, 'derivative', $4, $5, $6, $7, 'pending',
         clock_timestamp() + $8 * interval '1 millisecond')`,
      [
        derivativeId,
        written.tenantId,
        written.ownerUserId,
        written.backend,
        written.mediaType,
        written.sizeBytes,
        written.sha256,
        this.settings.pendingUploadTtlMs,
      ],
    );
    try {
      await this.store.put(derivativeId, derivative, { mediaType });
      await this.recordImage(job, derivativeId);
    } catch (error) {
      // Whatever was written keeps a record the collector finds, even if the row is gone.
      await entombUnpublished(this.db, this.store, this.logger, written);
      throw error;
    }
  }

  private async recordImage(job: ClaimedJob, derivativeId: string): Promise<void> {
    await this.db.transaction(async (manager) => {
      await this.lockFile(manager, job.contentId);
      // A write slower than its reservation finds it expired: the copy is not published, and the
      // job is tried again under a new identity. Locked, so the collector cannot take the row
      // while this transaction decides.
      const reserved: unknown[] = await manager.query(
        `SELECT 1 FROM "api_artifact_contents" WHERE "id" = $1 AND "state" = 'pending' FOR UPDATE`,
        [derivativeId],
      );
      if (reserved.length !== 1) {
        throw new Error('The reduced copy lost its reservation while it was written.');
      }
      const updated: unknown[] = await manager.query(
        `WITH done AS (UPDATE "api_artifact_extractions" SET "state" = 'ready',
             "derivative_content_id" = $3, "failure_code" = NULL,
             "lease_owner" = NULL, "lease_expires_at" = NULL, "updated_at" = now()
           WHERE "content_id" = $1 AND "lease_owner" = $2 AND "state" = 'running'
           RETURNING "content_id") SELECT "content_id" FROM done`,
        [job.contentId, this.owner, derivativeId],
      );
      // The lease was lost, or the file was deleted meanwhile: the copy belongs to nobody.
      const owned =
        updated.length === 1 && (await this.settle(manager, job.contentId, 'ready', null, null));
      await manager.query(
        `UPDATE "api_artifact_contents" SET "state" = $2, "expires_at" = NULL, "updated_at" = now() WHERE "id" = $1`,
        [derivativeId, owned ? 'ready' : 'purging'],
      );
    });
  }

  private async fail(job: ClaimedJob, code: FileFailureCode, retry: boolean): Promise<void> {
    if (retry) {
      await this.db.query(
        `UPDATE "api_artifact_extractions" SET "state" = 'queued', "lease_owner" = NULL,
           "lease_expires_at" = NULL, "updated_at" = now(),
           "next_attempt_at" = clock_timestamp() + $3 * interval '1 millisecond'
         WHERE "content_id" = $1 AND "lease_owner" = $2`,
        [job.contentId, this.owner, RETRY_DELAY_MS * job.attempts],
      );
      return;
    }
    await this.db.transaction(async (manager) => {
      await this.lockFile(manager, job.contentId);
      const updated: unknown[] = await manager.query(
        `WITH done AS (UPDATE "api_artifact_extractions" SET "state" = 'failed', "failure_code" = $3,
             "lease_owner" = NULL, "lease_expires_at" = NULL, "updated_at" = now()
           WHERE "content_id" = $1 AND "lease_owner" = $2 RETURNING "content_id")
         SELECT "content_id" FROM done`,
        [job.contentId, this.owner, code],
      );
      if (updated.length === 1) await this.settle(manager, job.contentId, 'failed', code, null);
    });
  }

  /** Reflects the outcome on the catalog row, which is what lists and filters read. */
  private async settle(
    manager: { query(sql: string, parameters: unknown[]): Promise<unknown[]> },
    contentId: string,
    readiness: 'ready' | 'failed',
    failureCode: FileFailureCode | null,
    pageCount: number | null,
  ): Promise<boolean> {
    const rows = await manager.query(
      `WITH done AS (UPDATE "api_artifacts" a SET "readiness" = $2, "failure_code" = $3,
           "page_count" = $4, "updated_at" = now()
         FROM "api_artifact_revisions" r
         WHERE r."content_id" = $1 AND a."id" = r."artifact_id" AND a."deleted_at" IS NULL
         RETURNING a."id") SELECT "id" FROM done`,
      [contentId, readiness, failureCode, pageCount],
    );
    return rows.length === 1;
  }
}
