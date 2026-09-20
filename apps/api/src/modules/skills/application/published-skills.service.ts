import type { PublishedSkillDetail, PublishedSkillSummary } from '@alfred/contracts';
import { Injectable } from '@nestjs/common';
import { DataSource, In, type EntityManager } from 'typeorm';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { findOwnedOrThrow } from '../../../common/ownership/find-owned';
import { OwnedResourceNotFoundException } from '../../../common/ownership/owned-resource-not-found.exception';
import { paginateByCursor } from '../../../common/pagination/paginate';
import { TenantsService } from '../../tenants/tenants.service';
import { SkillFileEntity } from '../infrastructure/skill-file.entity';
import { SkillVersionEntity } from '../infrastructure/skill-version.entity';
import { SkillEntity } from '../infrastructure/skill.entity';

const AVAILABLE = 'skill.enabled = true AND skill.publishedVersion IS NOT NULL';
// A renamed draft keeps its published name until it is published again: match the snapshot.
const PUBLISHED_NAME = `EXISTS (SELECT 1 FROM "api_skill_versions" "snapshot" WHERE "snapshot"."skill_id" = "skill"."id" AND "snapshot"."version" = "skill"."published_version" AND "snapshot"."name" = :name)`;

function toPublishedSummary(
  skill: SkillEntity,
  snapshot: SkillVersionEntity,
): PublishedSkillSummary {
  return {
    id: skill.id,
    name: snapshot.name,
    description: snapshot.description,
    publishedVersion: snapshot.version,
    contentHash: snapshot.contentHash,
    totalBytes: snapshot.totalBytes,
    publishedAt: (snapshot.publishedAt ?? snapshot.createdAt).toISOString(),
  };
}

/**
 * Read side for whoever consumes skills rather than authors them: only enabled skills, only at
 * their published snapshot. The authoring routes keep serving the current (possibly draft) version.
 */
@Injectable()
export class PublishedSkillsService {
  constructor(
    private readonly db: DataSource,
    private readonly tenants: TenantsService,
  ) {}

  async list(principal: AuthPrincipal, query: { cursor?: string; limit?: number; name?: string }) {
    const scope = await this.tenants.scopeFor(principal.id);
    // One snapshot: a publication between the two reads cannot pair a skill with another version.
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const builder = manager
        .getRepository(SkillEntity)
        .createQueryBuilder('skill')
        .where('skill.tenantId = :tenantId AND skill.ownerUserId = :ownerUserId', scope)
        .andWhere(AVAILABLE);
      if (query.name !== undefined) builder.andWhere(PUBLISHED_NAME, { name: query.name });
      const page = await paginateByCursor(builder, {
        cursor: query.cursor,
        limit: query.limit,
        sortColumn: 'created_at',
      });
      const snapshots = await this.snapshots(manager, page.items);
      return {
        items: page.items.map((skill) => toPublishedSummary(skill, snapshots.get(skill.id)!)),
        nextCursor: page.nextCursor,
      };
    });
  }

  async get(principal: AuthPrincipal, id: string): Promise<PublishedSkillDetail> {
    const scope = await this.tenants.scopeFor(principal.id);
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const skill = await findOwnedOrThrow(
        manager.getRepository(SkillEntity),
        { id, ...scope },
        'skill',
      );
      // Disabled or never published: the same answer as a skill that does not exist.
      if (!skill.enabled || skill.publishedVersion === null)
        throw new OwnedResourceNotFoundException('skill');
      const snapshot = (await this.snapshots(manager, [skill])).get(skill.id)!;
      const files = await manager.getRepository(SkillFileEntity).find({
        where: { skillId: skill.id, version: snapshot.version },
        order: { path: 'ASC' },
      });
      return {
        ...toPublishedSummary(skill, snapshot),
        files: files.map((file) => ({
          path: file.path,
          mediaType: file.mediaType,
          contentBase64: file.content.toString('base64'),
        })),
      };
    });
  }

  private async snapshots(
    manager: EntityManager,
    skills: readonly SkillEntity[],
  ): Promise<Map<string, SkillVersionEntity>> {
    if (skills.length === 0) return new Map();
    const published = new Map<string, number>();
    for (const skill of skills)
      if (skill.publishedVersion !== null) published.set(skill.id, skill.publishedVersion);
    // Two IN lists over-select (skill A at B's version); the pairing below keeps exact matches.
    const rows = await manager.getRepository(SkillVersionEntity).find({
      where: { skillId: In([...published.keys()]), version: In([...new Set(published.values())]) },
    });
    const found = new Map(
      rows
        .filter((row) => published.get(row.skillId) === row.version)
        .map((row) => [row.skillId, row]),
    );
    // The published pointer references a retained snapshot; a missing one is corrupted data.
    for (const skill of skills)
      if (!found.has(skill.id)) throw new Error('Published skill snapshot is missing');
    return found;
  }
}
