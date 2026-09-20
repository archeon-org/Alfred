import {
  FILE_ROOT_FOLDER,
  type FileListFilters,
  type FilePage,
  type FileQuota,
  type StoredFile,
  type UpdateFileInput,
} from '@alfred/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, IsNull, type EntityManager } from 'typeorm';

import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { ApiException } from '../../../common/errors/api.exception';
import { findOwnedOrThrow } from '../../../common/ownership/find-owned';
import type { OwnerScope } from '../../../common/ownership/owner-scope';
import { paginateByCursor } from '../../../common/pagination/paginate';
import { TenantsService } from '../../tenants/tenants.service';
import { ARTIFACT_CONTENT_STORE, type ArtifactContentStore } from '../domain/content-store.port';
import { nameKey, normalizeFileRename } from '../domain/file-name';
import { ArtifactFolderEntity } from '../infrastructure/persistence/artifact-folder.entity';
import { ArtifactEntity } from '../infrastructure/persistence/artifact.entity';
import { FileCollector } from './file-collector';
import { loadUsage, toStoredFile } from './file-presenter';
import { lockOwner, readQuota } from './file-quota';
import { FILE_SETTINGS, type FileSettings } from './file-settings';

export const FILE_RESOURCE = 'file';

export interface FileBytes {
  readonly bytes: Buffer;
  readonly mediaType: string;
  readonly name: string;
}

const ROW_LOCK = { lock: { mode: 'pessimistic_write' } } as const;

/** Reads and changes of the personal library. Every query carries the owner scope. */
@Injectable()
export class FilesService {
  constructor(
    private readonly db: DataSource,
    private readonly tenants: TenantsService,
    private readonly collector: FileCollector,
    @Inject(ARTIFACT_CONTENT_STORE) private readonly store: ArtifactContentStore,
    @Inject(FILE_SETTINGS) private readonly settings: FileSettings,
  ) {}

  async list(
    principal: AuthPrincipal,
    query: FileListFilters & { cursor?: string; limit?: number },
  ): Promise<FilePage> {
    const scope = await this.tenants.scopeFor(principal.id);
    const builder = this.db
      .getRepository(ArtifactEntity)
      .createQueryBuilder('artifact')
      .where('artifact.tenantId = :tenantId AND artifact.ownerUserId = :ownerUserId', scope)
      .andWhere('artifact.deletedAt IS NULL');

    if (query.search !== undefined && query.search.trim().length > 0) {
      builder.andWhere('(artifact.name ILIKE :search OR artifact.description ILIKE :search)', {
        search: `%${query.search.trim().replace(/[\\%_]/gu, '\\$&')}%`,
      });
    }
    if (query.kind !== undefined) builder.andWhere('artifact.kind = :kind', { kind: query.kind });
    if (query.readiness !== undefined) {
      builder.andWhere('artifact.readiness = :readiness', { readiness: query.readiness });
    }
    if (query.folderId === FILE_ROOT_FOLDER) builder.andWhere('artifact.folderId IS NULL');
    else if (query.folderId !== undefined) {
      builder.andWhere('artifact.folderId = :folderId', { folderId: query.folderId });
    }
    if (query.tag !== undefined) {
      builder.andWhere('artifact.tags @> CAST(:tag AS jsonb)', {
        tag: JSON.stringify([query.tag]),
      });
    }
    if (query.conversationId !== undefined) {
      // EXISTS rather than a join: pagination requires one row per file.
      builder.andWhere(
        `EXISTS (SELECT 1 FROM "api_message_attachments" attached
           JOIN "api_messages" message ON message."id" = attached."message_id"
           WHERE attached."artifact_id" = artifact.id AND message."conversation_id" = :conversationId)`,
        { conversationId: query.conversationId },
      );
    }

    const page = await paginateByCursor(builder, {
      cursor: query.cursor,
      limit: query.limit,
      sortColumn: 'created_at',
    });
    const usage = await loadUsage(
      this.db.manager,
      page.items.map((item) => item.id),
    );
    return {
      items: page.items.map((item) => toStoredFile(item, usage.get(item.id))),
      nextCursor: page.nextCursor,
    };
  }

  async get(principal: AuthPrincipal, id: string): Promise<StoredFile> {
    const scope = await this.tenants.scopeFor(principal.id);
    const artifact = await this.owned(this.db.manager, scope, id);
    const usage = await loadUsage(this.db.manager, [artifact.id]);
    return toStoredFile(artifact, usage.get(artifact.id));
  }

  async quota(principal: AuthPrincipal): Promise<FileQuota> {
    const scope = await this.tenants.scopeFor(principal.id);
    return readQuota(this.db.manager, scope, this.settings);
  }

  async update(principal: AuthPrincipal, id: string, input: UpdateFileInput): Promise<StoredFile> {
    const scope = await this.tenants.scopeFor(principal.id);
    const artifact = await this.db.transaction(async (manager) => {
      // Names and folders of one library change under the owner lock, like every allocation.
      await lockOwner(manager, scope);
      const current = await this.owned(manager, scope, id, true);
      const changes: Partial<ArtifactEntity> = {};

      if (input.name !== undefined) {
        const extension = current.name.slice(current.name.lastIndexOf('.'));
        const name = normalizeFileRename(input.name, extension.startsWith('.') ? extension : '');
        if (name === null) throw new ApiException(400, 'invalid_name', 'This name is not valid.');
        changes.name = name;
        changes.nameKey = nameKey(name);
      }
      if (input.folderId !== undefined) {
        if (
          input.folderId !== null &&
          !(await manager
            .getRepository(ArtifactFolderEntity)
            .existsBy({ id: input.folderId, ...scope }))
        ) {
          throw new ApiException(404, 'folder_not_found', 'Folder not found.');
        }
        changes.folderId = input.folderId;
      }
      if (input.tags !== undefined) {
        changes.tags = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))];
      }
      if (input.description !== undefined) {
        const description = input.description?.trim() ?? '';
        changes.description = description.length === 0 ? null : description;
      }

      const next = { ...current, ...changes };
      if (changes.name !== undefined || changes.folderId !== undefined) {
        await this.assertNameFree(manager, scope, next);
      }
      if (Object.keys(changes).length > 0) {
        await manager.getRepository(ArtifactEntity).update({ id, ...scope }, changes);
      }
      return next;
    });
    const usage = await loadUsage(this.db.manager, [artifact.id]);
    return toStoredFile(artifact, usage.get(artifact.id));
  }

  /**
   * The owner's explicit purge (ALF-DEC-028: deletion is a separate authorized user action).
   * The catalog row becomes a tombstone so that messages which carried the file keep naming it;
   * the bytes and the extracted text go, and the quota is free as soon as this commits.
   */
  async remove(principal: AuthPrincipal, id: string): Promise<void> {
    const scope = await this.tenants.scopeFor(principal.id);
    await this.db.transaction(async (manager) => {
      await lockOwner(manager, scope);
      const artifact = await this.owned(manager, scope, id, true);

      const busy: unknown[] = await manager.query(
        `SELECT 1 FROM "api_message_attachments" attached
           JOIN "api_messages" message ON message."id" = attached."message_id"
           JOIN "api_executions" execution ON execution."id" = message."execution_id"
         WHERE attached."artifact_id" = $1 AND execution."finished_at" IS NULL LIMIT 1`,
        [artifact.id],
      );
      if (busy.length > 0) {
        throw new ApiException(409, 'file_in_use', 'An answer is currently using this file.');
      }

      await manager
        .getRepository(ArtifactEntity)
        .update({ id, ...scope }, { deletedAt: new Date(), folderId: null });
      await manager.query(
        `UPDATE "api_artifact_extractions" e SET "text" = NULL, "char_count" = 0, "state" = 'failed',
           "failure_code" = 'unsupported', "lease_owner" = NULL, "lease_expires_at" = NULL,
           "updated_at" = now()
         FROM "api_artifact_revisions" r WHERE r."artifact_id" = $1 AND e."content_id" = r."content_id"`,
        [artifact.id],
      );
      // Originals and the reduced copies derived from them leave together.
      await manager.query(
        `UPDATE "api_artifact_contents" c SET "state" = 'purging', "expires_at" = NULL, "updated_at" = now()
         WHERE c."state" <> 'purged' AND (
           c."id" IN (SELECT r."content_id" FROM "api_artifact_revisions" r WHERE r."artifact_id" = $1)
           OR c."id" IN (SELECT e."derivative_content_id" FROM "api_artifact_extractions" e
             JOIN "api_artifact_revisions" r ON r."content_id" = e."content_id"
             WHERE r."artifact_id" = $1 AND e."derivative_content_id" IS NOT NULL))`,
        [artifact.id],
      );
    });
    this.collector.nudge();
  }

  /** The original bytes, for a download the API serves itself: no provider address is exposed. */
  async content(principal: AuthPrincipal, id: string): Promise<FileBytes> {
    const scope = await this.tenants.scopeFor(principal.id);
    const artifact = await this.owned(this.db.manager, scope, id);
    const rows: { content_id: string }[] = await this.db.query(
      `SELECT r."content_id" FROM "api_artifact_revisions" r
       JOIN "api_artifact_contents" c ON c."id" = r."content_id"
       WHERE r."id" = $1 AND c."state" = 'ready'`,
      [artifact.currentRevisionId],
    );
    return this.read(rows[0]?.content_id, artifact.mediaType, artifact.name);
  }

  /** The reduced copy of an image, for thumbnails; documents have none. */
  async preview(principal: AuthPrincipal, id: string): Promise<FileBytes> {
    const scope = await this.tenants.scopeFor(principal.id);
    const artifact = await this.owned(this.db.manager, scope, id);
    const rows: { content_id: string; media_type: string }[] = await this.db.query(
      `SELECT d."id" AS content_id, d."media_type" FROM "api_artifact_revisions" r
       JOIN "api_artifact_extractions" e ON e."content_id" = r."content_id"
       JOIN "api_artifact_contents" d ON d."id" = e."derivative_content_id"
       WHERE r."id" = $1 AND d."state" = 'ready'`,
      [artifact.currentRevisionId],
    );
    const row = rows[0];
    if (row === undefined) throw new ApiException(404, 'file_not_found', 'File not found.');
    return this.read(row.content_id, row.media_type, artifact.name);
  }

  private async read(
    contentId: string | undefined,
    mediaType: string,
    name: string,
  ): Promise<FileBytes> {
    const bytes = contentId === undefined ? null : await this.store.get(contentId);
    if (bytes === null) {
      throw new ApiException(410, 'file_content_purged', 'The file content is no longer stored.');
    }
    return { bytes, mediaType, name };
  }

  private owned(
    manager: EntityManager,
    scope: OwnerScope,
    id: string,
    lock = false,
  ): Promise<ArtifactEntity> {
    return findOwnedOrThrow(
      {
        findOne: (options) =>
          manager.getRepository(ArtifactEntity).findOne({
            ...options,
            where: { ...(options.where as object), deletedAt: IsNull() },
          }),
      },
      { id, ...scope },
      FILE_RESOURCE,
      lock ? ROW_LOCK : {},
    );
  }

  private async assertNameFree(
    manager: EntityManager,
    scope: OwnerScope,
    artifact: ArtifactEntity,
  ): Promise<void> {
    const taken: unknown[] = await manager.query(
      `SELECT 1 FROM "api_artifacts" WHERE "tenant_id" = $1 AND "owner_user_id" = $2
         AND "deleted_at" IS NULL AND "id" <> $3 AND "name_key" = $4
         AND "folder_id" IS NOT DISTINCT FROM $5 LIMIT 1`,
      [scope.tenantId, scope.ownerUserId, artifact.id, artifact.nameKey, artifact.folderId],
    );
    // ALF-DEC-013: "path collisions fail rather than overwrite".
    if (taken.length > 0) {
      throw new ApiException(409, 'file_name_conflict', 'A file with this name already exists.');
    }
  }
}
