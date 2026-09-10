import { createHash } from 'node:crypto';
import type {
  SkillDetail,
  SkillRestoreInput,
  SkillAvailabilityInput,
  SkillSummary,
  SkillUpdateInput,
  SkillWriteInput,
} from '@alfred/contracts';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { ApiException } from '../../../common/errors/api.exception';
import {
  deleteOwnedOrThrow,
  findOwnedOrThrow,
  updateOwnedOrThrow,
} from '../../../common/ownership/find-owned';
import type { OwnerScope } from '../../../common/ownership/owner-scope';
import { paginateByCursor } from '../../../common/pagination/paginate';
import { TenantsService } from '../../tenants/tenants.service';
import { UserEntity } from '../../users/user.entity';
import { SkillPackageValidationError, validateSkillPackage } from '../domain/skill-package';
import { changeSkillAvailability, listSkillVersions } from './skill-lifecycle';
import { assertSkillVersion, compareSkillPath } from './skill-version';
import { OwnedResourceNotFoundException } from '../../../common/ownership/owned-resource-not-found.exception';
import { SkillEntity } from '../infrastructure/skill.entity';
import { SkillVersionEntity } from '../infrastructure/skill-version.entity';
import { SkillFileEntity } from '../infrastructure/skill-file.entity';

export function toSkillSummary(skill: SkillEntity): SkillSummary {
  return {
    enabled: skill.enabled,
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    currentVersion: skill.currentVersion,
    publishedVersion: skill.publishedVersion,
    status: skill.publishedVersion === skill.currentVersion ? 'published' : 'draft',
    fileCount: skill.fileCount,
    totalBytes: skill.totalBytes,
    createdAt: skill.createdAt.toISOString(),
    updatedAt: skill.updatedAt.toISOString(),
  };
}
const ROW_LOCK = { lock: { mode: 'pessimistic_write' } } as const;
@Injectable()
export class SkillsService {
  constructor(
    private readonly db: DataSource,
    private readonly tenants: TenantsService,
    private readonly config: ConfigService,
  ) {}
  async list(
    principal: AuthPrincipal,
    query: { cursor?: string; limit?: number; search?: string },
  ) {
    const scope = await this.tenants.scopeFor(principal.id);
    const builder = this.db
      .getRepository(SkillEntity)
      .createQueryBuilder('skill')
      .where('skill.tenantId = :tenantId AND skill.ownerUserId = :ownerUserId', scope);
    if (query.search)
      builder.andWhere('(skill.name ILIKE :search OR skill.description ILIKE :search)', {
        search: `%${query.search.replace(/[\\%_]/gu, '\\$&')}%`,
      });
    const page = await paginateByCursor(builder, {
      cursor: query.cursor,
      limit: query.limit,
      sortColumn: 'created_at',
    });
    return { items: page.items.map(toSkillSummary), nextCursor: page.nextCursor };
  }
  async get(principal: AuthPrincipal, id: string): Promise<SkillDetail> {
    const scope = await this.tenants.scopeFor(principal.id);
    // Snapshot protects the current version plus files from concurrent updates/deletion.
    return this.db.transaction('REPEATABLE READ', async (manager) =>
      this.detail(
        manager,
        await findOwnedOrThrow(manager.getRepository(SkillEntity), { id, ...scope }, 'skill'),
      ),
    );
  }
  async create(principal: AuthPrincipal, input: SkillWriteInput): Promise<SkillDetail> {
    const files = this.validate(input);
    const scope = await this.tenants.scopeFor(principal.id);
    return this.uniqueName(async () =>
      this.db.transaction(async (manager) => {
        await this.lockOwner(manager, scope);
        await this.assertQuota(
          manager,
          scope,
          files.reduce((n, file) => n + file.sizeBytes, 0),
        );
        const repository = manager.getRepository(SkillEntity);
        const skill = await repository.save(
          repository.create({
            ...scope,
            name: input.name,
            description: input.description,
            enabled: true,
            version: 1,
            currentVersion: 1,
            publishedVersion: null,
            fileCount: files.length,
            totalBytes: files.reduce((n, file) => n + file.sizeBytes, 0),
          }),
        );
        await this.writeVersion(manager, skill, files);
        return this.detail(manager, skill);
      }),
    );
  }
  async update(
    principal: AuthPrincipal,
    id: string,
    input: SkillUpdateInput,
  ): Promise<SkillDetail> {
    const files = this.validate(input);
    const scope = await this.tenants.scopeFor(principal.id);
    return this.uniqueName(async () =>
      this.db.transaction(async (manager) => {
        await this.lockOwner(manager, scope);
        const repository = manager.getRepository(SkillEntity);
        const owned = { id, ...scope };
        const skill = await findOwnedOrThrow(repository, owned, 'skill', ROW_LOCK);
        assertSkillVersion(skill, input.expectedVersion);
        const current = await this.detail(manager, skill);
        const canonicalFiles = files
          .map((file) => ({
            path: file.path,
            mediaType: file.mediaType,
            contentBase64: file.content.toString('base64'),
          }))
          .sort(compareSkillPath);
        if (
          skill.name === input.name &&
          skill.description === input.description &&
          JSON.stringify([...current.files].sort(compareSkillPath)) ===
            JSON.stringify(canonicalFiles)
        )
          return current;
        await this.assertQuota(
          manager,
          scope,
          files.reduce((n, file) => n + file.sizeBytes, 0),
        );
        const next = {
          ...skill,
          name: input.name,
          description: input.description,
          version: skill.version + 1,
          // The current pointer may have moved backwards; retained snapshot IDs never do.
          currentVersion:
            (await manager.getRepository(SkillVersionEntity).maximum('version', { skillId: id }))! +
            1,
          fileCount: files.length,
          totalBytes: files.reduce((n, file) => n + file.sizeBytes, 0),
        };
        await this.writeVersion(manager, next, files);
        await updateOwnedOrThrow(
          repository,
          owned,
          {
            name: next.name,
            description: next.description,
            version: next.version,
            currentVersion: next.currentVersion,
            fileCount: next.fileCount,
            totalBytes: next.totalBytes,
          },
          'skill',
        );
        return this.detail(manager, await findOwnedOrThrow(repository, owned, 'skill'));
      }),
    );
  }
  async versions(principal: AuthPrincipal, id: string, query: { before?: number; limit?: number }) {
    const scope = await this.tenants.scopeFor(principal.id);
    return this.db.transaction('REPEATABLE READ', (manager) =>
      listSkillVersions(manager, { id, ...scope }, query),
    );
  }
  async restore(
    principal: AuthPrincipal,
    id: string,
    input: SkillRestoreInput,
  ): Promise<SkillDetail> {
    const scope = await this.tenants.scopeFor(principal.id);
    return this.uniqueName(() =>
      this.db.transaction(async (manager) => {
        await this.lockOwner(manager, scope);
        const repository = manager.getRepository(SkillEntity),
          owned = { id, ...scope };
        const skill = await findOwnedOrThrow(repository, owned, 'skill', ROW_LOCK);
        assertSkillVersion(skill, input.expectedVersion);
        if (skill.currentVersion === input.sourceVersion) return this.detail(manager, skill);
        const source = await manager
          .getRepository(SkillVersionEntity)
          .findOneBy({ skillId: id, version: input.sourceVersion });
        if (!source) throw new OwnedResourceNotFoundException('skill');
        const files = await manager
          .getRepository(SkillFileEntity)
          .find({ where: { skillId: id, version: source.version } });
        const next = {
          ...skill,
          name: source.name,
          description: source.description,
          version: skill.version + 1,
          currentVersion: source.version,
          totalBytes: source.totalBytes,
          fileCount: files.length,
        };
        await updateOwnedOrThrow(
          repository,
          owned,
          {
            name: next.name,
            description: next.description,
            version: next.version,
            currentVersion: next.currentVersion,
            totalBytes: next.totalBytes,
            fileCount: next.fileCount,
          },
          'skill',
        );
        return this.detail(manager, await findOwnedOrThrow(repository, owned, 'skill'));
      }),
    );
  }
  async availability(
    principal: AuthPrincipal,
    id: string,
    input: SkillAvailabilityInput,
  ): Promise<SkillDetail> {
    const scope = await this.tenants.scopeFor(principal.id);
    return this.db.transaction(async (manager) => {
      const skill = await changeSkillAvailability(manager, { id, ...scope }, input);
      return this.detail(manager, skill);
    });
  }
  async publish(
    principal: AuthPrincipal,
    id: string,
    expectedVersion: number,
  ): Promise<SkillDetail> {
    const scope = await this.tenants.scopeFor(principal.id);
    return this.db.transaction(async (manager) => {
      const repository = manager.getRepository(SkillEntity),
        owned = { id, ...scope };
      const skill = await findOwnedOrThrow(repository, owned, 'skill', ROW_LOCK);
      assertSkillVersion(skill, expectedVersion);
      if (skill.publishedVersion !== skill.currentVersion) {
        await manager
          .getRepository(SkillVersionEntity)
          .update({ skillId: id, version: skill.currentVersion }, { publishedAt: new Date() });
        await updateOwnedOrThrow(
          repository,
          owned,
          { publishedVersion: skill.currentVersion, version: skill.version + 1 },
          'skill',
        );
      }
      return this.detail(manager, await findOwnedOrThrow(repository, owned, 'skill'));
    });
  }
  /** No runtime copies exist in this delivery: purge versions and files via FK cascade. */
  async remove(principal: AuthPrincipal, id: string, expectedVersion: number): Promise<void> {
    const scope = await this.tenants.scopeFor(principal.id);
    await this.db.transaction(async (manager) => {
      const repository = manager.getRepository(SkillEntity),
        owned = { id, ...scope };
      assertSkillVersion(
        await findOwnedOrThrow(repository, owned, 'skill', ROW_LOCK),
        expectedVersion,
      );
      await deleteOwnedOrThrow(repository, owned, 'skill');
    });
  }
  private validate(input: SkillWriteInput) {
    try {
      return validateSkillPackage(input, {
        maxFiles: this.config.get<number>('SKILLS_MAX_FILES', 50),
        maxPackageBytes: this.config.get<number>('SKILLS_MAX_PACKAGE_BYTES', 1048576),
        maxSkillMarkdownBytes: this.config.get<number>('SKILLS_MAX_INSTRUCTIONS_BYTES', 131072),
      });
    } catch (error) {
      if (error instanceof SkillPackageValidationError)
        throw new ApiException(400, 'skill_package_invalid', error.message);
      throw error;
    }
  }
  private async writeVersion(
    manager: EntityManager,
    skill: SkillEntity,
    files: ReturnType<typeof validateSkillPackage>,
  ) {
    const hash = createHash('sha256');
    for (const file of [...files].sort(compareSkillPath))
      hash.update(JSON.stringify([file.path, file.mediaType, file.content.toString('base64')]));
    await manager.getRepository(SkillVersionEntity).insert({
      skillId: skill.id,
      version: skill.currentVersion,
      name: skill.name,
      description: skill.description,
      totalBytes: skill.totalBytes,
      contentHash: hash.digest('hex'),
      publishedAt: null,
    });
    await manager
      .getRepository(SkillFileEntity)
      .insert(files.map((file) => ({ ...file, skillId: skill.id, version: skill.currentVersion })));
  }
  private async detail(manager: EntityManager, skill: SkillEntity): Promise<SkillDetail> {
    const files = await manager.getRepository(SkillFileEntity).find({
      where: { skillId: skill.id, version: skill.currentVersion },
      order: { path: 'ASC' },
    });
    return {
      ...toSkillSummary(skill),
      files: files.map((file) => ({
        path: file.path,
        mediaType: file.mediaType,
        contentBase64: file.content.toString('base64'),
      })),
    };
  }
  private async lockOwner(manager: EntityManager, scope: OwnerScope) {
    // Serialize allocations while allowing other modules to reference this user's key.
    await manager.getRepository(UserEntity).findOneOrFail({
      where: { id: scope.ownerUserId, tenantId: scope.tenantId },
      lock: { mode: 'for_no_key_update' },
    });
  }
  private async assertQuota(manager: EntityManager, scope: OwnerScope, additional: number) {
    const usage = await manager
      .getRepository(SkillVersionEntity)
      .createQueryBuilder('version')
      .innerJoin(SkillEntity, 'skill', 'skill.id = version.skillId')
      .where('skill.tenantId = :tenantId AND skill.ownerUserId = :ownerUserId', scope)
      .select('COALESCE(SUM(version.totalBytes),0)', 'bytes')
      .getRawOne<{ bytes: string }>();
    if (
      Number(usage?.bytes ?? 0) + additional >
      this.config.get<number>('SKILLS_MAX_TOTAL_BYTES_PER_USER', 26214400)
    )
      throw new ApiException(
        409,
        'skill_storage_quota_exceeded',
        'Skill storage quota exceeded. Delete unused skills to free space.',
      );
  }
  private async uniqueName<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { constraint?: string }).constraint === 'uq_skills_owner_name'
      )
        throw new ApiException(
          409,
          'skill_name_conflict',
          'A skill with this name already exists.',
        );
      throw error;
    }
  }
}
