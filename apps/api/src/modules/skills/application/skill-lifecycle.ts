import type { SkillAvailabilityInput, SkillVersionSummary } from '@alfred/contracts';
import { LessThan, type EntityManager } from 'typeorm';
import { findOwnedOrThrow, updateOwnedOrThrow } from '../../../common/ownership/find-owned';
import type { OwnerScope } from '../../../common/ownership/owner-scope';
import { assertSkillVersion } from './skill-version';
import { SkillEntity } from '../infrastructure/skill.entity';
import { SkillVersionEntity } from '../infrastructure/skill-version.entity';

export async function listSkillVersions(
  manager: EntityManager,
  owned: OwnerScope & { id: string },
  query: { before?: number; limit?: number },
) {
  await findOwnedOrThrow(manager.getRepository(SkillEntity), owned, 'skill');
  const limit = query.limit ?? 20;
  const rows = await manager.getRepository(SkillVersionEntity).find({
    where: {
      skillId: owned.id,
      ...(query.before === undefined ? {} : { version: LessThan(query.before) }),
    },
    order: { version: 'DESC' },
    take: limit + 1,
  });
  const items: SkillVersionSummary[] = rows.slice(0, limit).map((row) => ({
    version: row.version,
    name: row.name,
    description: row.description,
    totalBytes: row.totalBytes,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
  }));
  return { items, nextBefore: rows.length > limit ? items.at(-1)!.version : null };
}

export async function changeSkillAvailability(
  manager: EntityManager,
  owned: OwnerScope & { id: string },
  input: SkillAvailabilityInput,
) {
  const repository = manager.getRepository(SkillEntity);
  // Serialize availability changes with edits, rollback, publication and deletion.
  const skill = await findOwnedOrThrow(repository, owned, 'skill', {
    lock: { mode: 'pessimistic_write' },
  });
  assertSkillVersion(skill, input.expectedVersion);
  if (skill.enabled !== input.enabled) {
    await updateOwnedOrThrow(
      repository,
      owned,
      { enabled: input.enabled, version: skill.version + 1 },
      'skill',
    );
  }
  return findOwnedOrThrow(repository, owned, 'skill');
}
