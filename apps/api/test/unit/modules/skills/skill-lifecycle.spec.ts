import { describe, expect, it, vi } from 'vitest';
import type { EntityManager } from 'typeorm';
import {
  changeSkillAvailability,
  listSkillVersions,
} from '@api/modules/skills/application/skill-lifecycle';
import { SkillEntity } from '@api/modules/skills/infrastructure/skill.entity';
import { SkillVersionEntity } from '@api/modules/skills/infrastructure/skill-version.entity';

const owned = { id: 'skill', tenantId: 'tenant', ownerUserId: 'owner' };
function fixture(enabled = true) {
  const skills = {
    findOne: vi.fn().mockResolvedValue({ ...owned, enabled, version: 3 }),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
  };
  const versions = { find: vi.fn().mockResolvedValue([]) };
  const repositories = new Map<unknown, unknown>([
    [SkillEntity, skills],
    [SkillVersionEntity, versions],
  ]);
  const manager = { getRepository: (entity: unknown) => repositories.get(entity) } as EntityManager;
  return { manager, skills, versions };
}
describe('skill lifecycle persistence boundaries', () => {
  it('locks the owner-scoped skill and changes availability without bindings', async () => {
    const { manager, skills } = fixture();
    await changeSkillAvailability(manager, owned, { expectedVersion: 3, enabled: false });
    expect(skills.findOne).toHaveBeenCalledWith({
      where: owned,
      lock: { mode: 'pessimistic_write' },
    });
    expect(skills.update).toHaveBeenCalledWith(owned, { enabled: false, version: 4 });
  });
  it('does not write on no-op, stale CAS, or inaccessible skills', async () => {
    const { manager, skills } = fixture(false);
    await changeSkillAvailability(manager, owned, { expectedVersion: 3, enabled: false });
    await expect(
      changeSkillAvailability(manager, owned, { expectedVersion: 2, enabled: false }),
    ).rejects.toMatchObject({ code: 'skill_version_conflict' });
    skills.findOne.mockResolvedValue(null);
    await expect(
      changeSkillAvailability(manager, owned, { expectedVersion: 3, enabled: true }),
    ).rejects.toMatchObject({ code: 'skill_not_found' });
    expect(skills.update).not.toHaveBeenCalled();
  });
  it('reenables with monotone CAS', async () => {
    const { manager, skills } = fixture(false);
    await changeSkillAvailability(manager, owned, { expectedVersion: 3, enabled: true });
    expect(skills.update).toHaveBeenCalledWith(owned, { enabled: true, version: 4 });
  });
  it('checks ownership before querying history and uses exclusive descending pagination', async () => {
    const { manager, skills, versions } = fixture();
    expect(await listSkillVersions(manager, owned, {})).toEqual({ items: [], nextBefore: null });
    expect(versions.find).toHaveBeenCalledWith({
      where: { skillId: 'skill' },
      order: { version: 'DESC' },
      take: 21,
    });
    const date = new Date('2026-09-10T00:00:00Z');
    versions.find.mockResolvedValue(
      [2, 1].map((version) => ({
        version,
        createdAt: date,
        publishedAt: version === 1 ? date : null,
        name: 'test',
        description: 'test',
        totalBytes: 5,
      })),
    );
    expect(await listSkillVersions(manager, owned, { before: 3, limit: 1 })).toMatchObject({
      items: [{ version: 2, publishedAt: null }],
      nextBefore: 2,
    });
    skills.findOne.mockResolvedValue(null);
    versions.find.mockClear();
    await expect(listSkillVersions(manager, owned, {})).rejects.toMatchObject({
      code: 'skill_not_found',
    });
    expect(versions.find).not.toHaveBeenCalled();
  });
});
