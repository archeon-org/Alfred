import {
  FOLDER_MAX_COUNT,
  FOLDER_MAX_DEPTH,
  type CreateFolderInput,
  type FileFolder,
  type UpdateFolderInput,
} from '@alfred/contracts';
import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { ApiException } from '../../../common/errors/api.exception';
import { findOwnedOrThrow } from '../../../common/ownership/find-owned';
import type { OwnerScope } from '../../../common/ownership/owner-scope';
import { TenantsService } from '../../tenants/tenants.service';
import { nameKey, normalizeFolderName } from '../domain/file-name';
import { ArtifactFolderEntity } from '../infrastructure/persistence/artifact-folder.entity';
import { toFileFolder } from './file-presenter';
import { lockOwner } from './file-quota';

export const FOLDER_RESOURCE = 'folder';

const ROW_LOCK = { lock: { mode: 'pessimistic_write' } } as const;

/**
 * Folders organize the personal library. They are rows, never storage paths (ALF-DEC-054: no
 * caller learns a physical key): a rename or a move is one update, whatever the folder holds.
 */
@Injectable()
export class FileFoldersService {
  constructor(
    private readonly db: DataSource,
    private readonly tenants: TenantsService,
  ) {}

  /** The whole tree in one answer; a library holds at most `FOLDER_MAX_COUNT` folders. */
  async list(principal: AuthPrincipal): Promise<readonly FileFolder[]> {
    const scope = await this.tenants.scopeFor(principal.id);
    const folders = await this.db.getRepository(ArtifactFolderEntity).find({
      where: scope,
      order: { depth: 'ASC', nameKey: 'ASC' },
      take: FOLDER_MAX_COUNT,
    });
    const counts = await this.fileCounts(this.db.manager, scope);
    return folders.map((folder) => toFileFolder(folder, counts.get(folder.id) ?? 0));
  }

  async create(principal: AuthPrincipal, input: CreateFolderInput): Promise<FileFolder> {
    const name = this.validName(input.name);
    const scope = await this.tenants.scopeFor(principal.id);
    return this.db.transaction(async (manager) => {
      await lockOwner(manager, scope);
      const repository = manager.getRepository(ArtifactFolderEntity);
      if ((await repository.countBy(scope)) >= FOLDER_MAX_COUNT) {
        throw new ApiException(409, 'folder_limit_reached', 'The folder limit is reached.');
      }
      const parentId = input.parentId ?? null;
      const depth = parentId === null ? 1 : (await this.owned(manager, scope, parentId)).depth + 1;
      if (depth > FOLDER_MAX_DEPTH) {
        throw new ApiException(409, 'folder_depth_exceeded', 'Folders cannot be nested deeper.');
      }
      await this.assertNameFree(manager, scope, parentId, name, null);
      const folder = await repository.save(
        repository.create({ ...scope, parentId, name, nameKey: nameKey(name), depth }),
      );
      return toFileFolder(folder, 0);
    });
  }

  async update(
    principal: AuthPrincipal,
    id: string,
    input: UpdateFolderInput,
  ): Promise<FileFolder> {
    const scope = await this.tenants.scopeFor(principal.id);
    return this.db.transaction(async (manager) => {
      await lockOwner(manager, scope);
      const folder = await this.owned(manager, scope, id, true);
      const name = input.name === undefined ? folder.name : this.validName(input.name);
      const parentId = input.parentId === undefined ? folder.parentId : input.parentId;

      let depth = folder.depth;
      if (parentId !== folder.parentId) {
        depth = await this.depthUnder(manager, scope, folder, parentId);
      }
      if (name !== folder.name || parentId !== folder.parentId) {
        await this.assertNameFree(manager, scope, parentId, name, folder.id);
      }

      await manager
        .getRepository(ArtifactFolderEntity)
        .update({ id, ...scope }, { name, nameKey: nameKey(name), parentId, depth });
      if (depth !== folder.depth) await this.shiftSubtree(manager, id, depth - folder.depth);

      const counts = await this.fileCounts(manager, scope);
      return toFileFolder({ ...folder, name, parentId, depth }, counts.get(id) ?? 0);
    });
  }

  /** Only an empty folder goes: deleting files is always an explicit act on each file. */
  async remove(principal: AuthPrincipal, id: string): Promise<void> {
    const scope = await this.tenants.scopeFor(principal.id);
    await this.db.transaction(async (manager) => {
      await lockOwner(manager, scope);
      await this.owned(manager, scope, id, true);
      const occupied: unknown[] = await manager.query(
        `SELECT 1 FROM "api_artifact_folders" WHERE "parent_id" = $1
         UNION ALL
         SELECT 1 FROM "api_artifacts" WHERE "folder_id" = $1 AND "deleted_at" IS NULL LIMIT 1`,
        [id],
      );
      if (occupied.length > 0) {
        throw new ApiException(409, 'folder_not_empty', 'Move or delete its content first.');
      }
      await manager.getRepository(ArtifactFolderEntity).delete({ id, ...scope });
    });
  }

  /** The depth the folder would have under `parentId`, refusing a cycle or too deep a subtree. */
  private async depthUnder(
    manager: EntityManager,
    scope: OwnerScope,
    folder: ArtifactFolderEntity,
    parentId: string | null,
  ): Promise<number> {
    const subtree: { id: string; depth: number }[] = await manager.query(
      `WITH RECURSIVE subtree AS (
         SELECT "id", "depth" FROM "api_artifact_folders" WHERE "id" = $1
         UNION ALL
         SELECT child."id", child."depth" FROM "api_artifact_folders" child
           JOIN subtree ON child."parent_id" = subtree."id"
       ) SELECT "id", "depth" FROM subtree`,
      [folder.id],
    );
    if (parentId !== null && subtree.some((row) => row.id === parentId)) {
      throw new ApiException(409, 'folder_cycle', 'A folder cannot be moved into itself.');
    }
    const depth = parentId === null ? 1 : (await this.owned(manager, scope, parentId)).depth + 1;
    const deepest = Math.max(...subtree.map((row) => row.depth)) - folder.depth;
    if (depth + deepest > FOLDER_MAX_DEPTH) {
      throw new ApiException(409, 'folder_depth_exceeded', 'Folders cannot be nested deeper.');
    }
    return depth;
  }

  private async shiftSubtree(manager: EntityManager, id: string, delta: number): Promise<void> {
    await manager.query(
      `WITH RECURSIVE descendants AS (
         SELECT "id" FROM "api_artifact_folders" WHERE "parent_id" = $1
         UNION ALL
         SELECT child."id" FROM "api_artifact_folders" child
           JOIN descendants ON child."parent_id" = descendants."id"
       ) UPDATE "api_artifact_folders" f SET "depth" = f."depth" + $2, "updated_at" = now()
         FROM descendants WHERE f."id" = descendants."id"`,
      [id, delta],
    );
  }

  private validName(requested: string): string {
    const name = normalizeFolderName(requested);
    if (name === null) throw new ApiException(400, 'invalid_name', 'This name is not valid.');
    return name;
  }

  private owned(
    manager: EntityManager,
    scope: OwnerScope,
    id: string,
    lock = false,
  ): Promise<ArtifactFolderEntity> {
    return findOwnedOrThrow(
      manager.getRepository(ArtifactFolderEntity),
      { id, ...scope },
      FOLDER_RESOURCE,
      lock ? ROW_LOCK : {},
    );
  }

  private async assertNameFree(
    manager: EntityManager,
    scope: OwnerScope,
    parentId: string | null,
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    const taken: unknown[] = await manager.query(
      `SELECT 1 FROM "api_artifact_folders" WHERE "tenant_id" = $1 AND "owner_user_id" = $2
         AND "parent_id" IS NOT DISTINCT FROM $3 AND "name_key" = $4
         AND ($5::uuid IS NULL OR "id" <> $5::uuid) LIMIT 1`,
      [scope.tenantId, scope.ownerUserId, parentId, nameKey(name), exceptId],
    );
    if (taken.length > 0) {
      throw new ApiException(
        409,
        'folder_name_conflict',
        'A folder with this name already exists.',
      );
    }
  }

  private async fileCounts(
    manager: EntityManager,
    scope: OwnerScope,
  ): Promise<ReadonlyMap<string, number>> {
    const rows: { folder_id: string; files: string }[] = await manager.query(
      `SELECT "folder_id", count(*) AS files FROM "api_artifacts"
       WHERE "tenant_id" = $1 AND "owner_user_id" = $2 AND "deleted_at" IS NULL
         AND "folder_id" IS NOT NULL GROUP BY "folder_id"`,
      [scope.tenantId, scope.ownerUserId],
    );
    return new Map(rows.map((row) => [row.folder_id, Number(row.files)]));
  }
}
