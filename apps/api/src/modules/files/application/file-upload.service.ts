import type { FileUploadResult } from '@alfred/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, MoreThan, type EntityManager } from 'typeorm';

import type { FileStorageSettings } from '../../../config/file-storage';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { ApiException } from '../../../common/errors/api.exception';
import type { OwnerScope } from '../../../common/ownership/owner-scope';
import { TenantsService } from '../../tenants/tenants.service';
import { sha256Of } from '../domain/content-digest';
import { ARTIFACT_CONTENT_STORE, type ArtifactContentStore } from '../domain/content-store.port';
import { FileRejection, inspectUpload, type InspectedFile } from '../domain/file-inspection';
import { nameKey, sanitizeFileName, suffixedName } from '../domain/file-name';
import { ArtifactContentEntity } from '../infrastructure/persistence/artifact-content.entity';
import { ArtifactExtractionEntity } from '../infrastructure/persistence/artifact-extraction.entity';
import { ArtifactFolderEntity } from '../infrastructure/persistence/artifact-folder.entity';
import { ArtifactRevisionEntity } from '../infrastructure/persistence/artifact-revision.entity';
import { ArtifactEntity } from '../infrastructure/persistence/artifact.entity';
import { FILE_STORAGE_SETTINGS } from '../infrastructure/storage/file-storage.settings';
import { entombUnpublished, type WrittenContent } from './content-tombstone';
import {
  admitUpload,
  artifactOfContent,
  artifactWithDigest,
  type Admission,
  type UploadInput,
} from './file-upload-admission';
import { FileExtractionWorker } from './file-extraction.worker';
import { loadUsage, toStoredFile } from './file-presenter';
import { lockOwner } from './file-quota';
import { FILE_SETTINGS, type FileSettings } from './file-settings';

export type { UploadInput } from './file-upload-admission';

const MAX_NAME_ATTEMPTS = 200;

/** 499 is what proxies log for a client that closed the request; nobody reads this answer. */
export const uploadCancelled = (): ApiException =>
  new ApiException(499, 'upload_cancelled', 'The upload was cancelled by the client.');

/**
 * The write path of an upload (ALF-DEC-054: pending → verified → ready, with idempotency and
 * quota reservation). Bytes go to the content store *between* two transactions, because a write
 * to another system is never part of a PostgreSQL transaction (Revision 86): the first reserves
 * quota with a `pending` row, the second publishes it. A crash in between leaves a reservation
 * that expires and an object the collector removes.
 */
@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);

  constructor(
    private readonly db: DataSource,
    private readonly tenants: TenantsService,
    private readonly extraction: FileExtractionWorker,
    @Inject(ARTIFACT_CONTENT_STORE) private readonly store: ArtifactContentStore,
    @Inject(FILE_SETTINGS) private readonly settings: FileSettings,
    @Inject(FILE_STORAGE_SETTINGS) private readonly storage: FileStorageSettings,
  ) {}

  /**
   * `signal` aborts when the browser gave the request up. Nothing is published for an upload
   * nobody awaits: the user removed it from the screen, so a file appearing in the library and
   * charging the quota afterwards would be a file they never see and cannot explain.
   */
  async upload(
    principal: AuthPrincipal,
    input: UploadInput,
    signal?: AbortSignal,
  ): Promise<FileUploadResult> {
    const inspected = this.inspect(input.bytes);
    const sha256 = sha256Of(input.bytes);
    const scope = await this.tenants.scopeFor(principal.id);

    const admission = await this.db.transaction((manager) =>
      admitUpload(manager, scope, input, inspected, sha256, {
        settings: this.settings,
        backend: this.storage.driver,
      }),
    );
    if (admission.existing !== undefined) return this.present(admission.existing);

    const written: WrittenContent = {
      contentId: admission.contentId,
      ...scope,
      role: 'original',
      backend: this.storage.driver,
      mediaType: inspected.mediaType,
      sizeBytes: input.bytes.byteLength,
      sha256,
    };
    // Read each time: the signal changes while this request awaits the store and the database.
    const gone = (): boolean => signal?.aborted === true;
    // Whatever was written under a content that is not published keeps a record to be found by.
    const giveUp = async (): Promise<void> => {
      await this.abandon(admission);
      await entombUnpublished(this.db, this.store, this.logger, written);
    };

    try {
      await this.store.put(admission.contentId, input.bytes, {
        mediaType: inspected.mediaType,
        signal,
      });
    } catch (error) {
      await giveUp();
      if (gone()) throw uploadCancelled();
      this.logger.error(`Content write failed for ${admission.contentId}`, error);
      throw new ApiException(503, 'storage_unavailable', 'The file storage is unavailable.');
    }
    if (gone()) {
      await giveUp();
      throw uploadCancelled();
    }

    let published: { artifact: ArtifactEntity; deduplicated: boolean };
    try {
      published = await this.db.transaction(async (manager) => {
        const result = await this.publish(
          manager,
          scope,
          input,
          inspected,
          sha256,
          admission.contentId,
        );
        // Last look before committing: a browser that left during publication gets no file.
        if (gone()) throw uploadCancelled();
        return result;
      });
    } catch (error) {
      if (gone()) await this.abandon(admission);
      await entombUnpublished(this.db, this.store, this.logger, written);
      throw error;
    }
    // Answered by another content: the bytes written here must stay reachable by the collector.
    if (published.deduplicated) {
      await entombUnpublished(this.db, this.store, this.logger, written);
    }
    this.extraction.nudge();
    return this.present(published);
  }

  /**
   * Releases a reservation that will not be published; the collector then removes its bytes. It
   * only ever touches a content that is still pending and that no revision references, so it can
   * never take a published file with it — a twin request of the same upload identity may have
   * published this very content in the meantime. It is fenced by the deadline this request wrote:
   * a twin that took the reservation over wrote its own, and is still writing.
   */
  private async abandon(admission: Admission): Promise<void> {
    await this.db.query(
      `UPDATE "api_artifact_contents" c SET "state" = 'failed', "expires_at" = NULL, "updated_at" = now()
       WHERE c."id" = $1 AND c."state" = 'pending' AND c."expires_at" = $2
         AND NOT EXISTS (SELECT 1 FROM "api_artifact_revisions" r WHERE r."content_id" = c."id")`,
      [admission.contentId, admission.deadline],
    );
  }

  private inspect(bytes: Buffer): InspectedFile {
    if (bytes.byteLength === 0) {
      throw new ApiException(422, 'file_rejected', 'The file is empty.');
    }
    if (bytes.byteLength > this.settings.maxFileBytes) {
      throw new ApiException(413, 'file_too_large', 'The file exceeds the size limit.', {
        maxFileBytes: this.settings.maxFileBytes,
      });
    }
    try {
      return inspectUpload(bytes);
    } catch (error) {
      if (!(error instanceof FileRejection)) throw error;
      throw error.code === 'unsupported_media_type'
        ? new ApiException(415, error.code, 'This file type is not accepted.')
        : new ApiException(422, error.code, 'The file could not be accepted.');
    }
  }

  /** Second transaction: the bytes are stored, so the library entry may now exist. */
  private async publish(
    manager: EntityManager,
    scope: OwnerScope,
    input: UploadInput,
    inspected: InspectedFile,
    sha256: string,
    contentId: string,
  ): Promise<{ artifact: ArtifactEntity; deduplicated: boolean }> {
    await lockOwner(manager, scope);
    const contents = manager.getRepository(ArtifactContentEntity);

    // Two requests may carry one upload identity (a double click, a retry racing its original):
    // they share this content. If the twin already published it, this request answers the same
    // file — and must not read its own published content as somebody else's duplicate.
    const mine = await artifactOfContent(manager, contentId);
    if (mine !== null) return { artifact: mine, deduplicated: false };

    // Another upload of the same bytes may have published while this one was writing. This copy
    // is then unreferenced and goes to the collector; the guard makes that a fact, not a hope.
    const same = await artifactWithDigest(manager, scope, sha256);
    if (same !== null) {
      await manager.query(
        `UPDATE "api_artifact_contents" c SET "state" = 'purging', "expires_at" = NULL, "updated_at" = now()
         WHERE c."id" = $1
           AND NOT EXISTS (SELECT 1 FROM "api_artifact_revisions" r WHERE r."content_id" = c."id")`,
        [contentId],
      );
      return { artifact: same, deduplicated: true };
    }

    // The folder may have been removed meanwhile; the file then lands at the top level.
    const folderId =
      input.folderId !== null &&
      (await manager.getRepository(ArtifactFolderEntity).existsBy({ id: input.folderId, ...scope }))
        ? input.folderId
        : null;

    // An expired reservation stopped counting against the quota, and another upload may have been
    // admitted in its place: it is not published, even if the collector has not come by yet.
    const readied = await contents.update(
      { id: contentId, state: 'pending', expiresAt: MoreThan(new Date()) },
      { state: 'ready', expiresAt: null },
    );
    if (readied.affected !== 1) {
      // The reservation expired, was collected or was abandoned by a twin during the write.
      throw new ApiException(409, 'file_upload_conflict', 'The upload expired. Send it again.');
    }
    const artifacts = manager.getRepository(ArtifactEntity);
    const name = await this.freeName(
      manager,
      scope,
      folderId,
      sanitizeFileName(input.declaredName, inspected.extension),
    );
    const artifact = await artifacts.save(
      artifacts.create({
        ...scope,
        folderId,
        name,
        nameKey: nameKey(name),
        kind: inspected.kind,
        mediaType: inspected.mediaType,
        sizeBytes: input.bytes.byteLength,
        sha256,
        currentRevisionId: null,
        readiness: 'processing',
        failureCode: null,
        pageCount: null,
        description: null,
        tags: [],
        deletedAt: null,
      }),
    );
    const revisions = manager.getRepository(ArtifactRevisionEntity);
    const revision = await revisions.save(
      revisions.create({ artifactId: artifact.id, revisionNo: 1, contentId, origin: 'upload' }),
    );
    await artifacts.update({ id: artifact.id }, { currentRevisionId: revision.id });
    const extractions = manager.getRepository(ArtifactExtractionEntity);
    await extractions.save(extractions.create({ contentId, kind: inspected.kind }));
    return { artifact: { ...artifact, currentRevisionId: revision.id }, deduplicated: false };
  }

  private async present(result: {
    readonly artifact: ArtifactEntity;
    readonly deduplicated: boolean;
  }): Promise<FileUploadResult> {
    const usage = await loadUsage(this.db.manager, [result.artifact.id]);
    return {
      file: toStoredFile(result.artifact, usage.get(result.artifact.id)),
      deduplicated: result.deduplicated,
    };
  }

  /** Under the owner lock, so the first free name stays free until this transaction commits. */
  private async freeName(
    manager: EntityManager,
    scope: OwnerScope,
    folderId: string | null,
    wanted: string,
  ): Promise<string> {
    const rows: { name_key: string }[] = await manager.query(
      `SELECT "name_key" FROM "api_artifacts"
       WHERE "tenant_id" = $1 AND "owner_user_id" = $2 AND "deleted_at" IS NULL
         AND "folder_id" IS NOT DISTINCT FROM $3`,
      [scope.tenantId, scope.ownerUserId, folderId],
    );
    const taken = new Set(rows.map((row) => row.name_key));
    for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt += 1) {
      const candidate = suffixedName(wanted, attempt);
      if (!taken.has(nameKey(candidate))) return candidate;
    }
    throw new ApiException(409, 'file_name_conflict', 'Too many files share this name.');
  }
}
