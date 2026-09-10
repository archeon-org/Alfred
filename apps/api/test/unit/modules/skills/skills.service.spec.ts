import { ConfigService } from '@nestjs/config';
import { QueryFailedError, type DataSource, type EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { SkillsService, toSkillSummary } from '@api/modules/skills/application/skills.service';
import { assertSkillVersion } from '@api/modules/skills/application/skill-version';
import { SkillEntity } from '@api/modules/skills/infrastructure/skill.entity';
import { SkillVersionEntity } from '@api/modules/skills/infrastructure/skill-version.entity';
import { SkillFileEntity } from '@api/modules/skills/infrastructure/skill-file.entity';
import { UserEntity } from '@api/modules/users/user.entity';
import type { TenantsService } from '@api/modules/tenants/tenants.service';
import type { AuthPrincipal } from '@api/common/auth/auth-principal';

const principal: AuthPrincipal = {
  id: 'owner',
  email: 'a@example.test',
  role: 'user',
  sessionId: 'session',
};
const scope = { tenantId: 'tenant', ownerUserId: 'owner' };
const markdown = '---\nname: review-code\ndescription: Review changes\n---\nReview the diff.';
const input = {
  name: 'review-code',
  description: 'Review changes',
  files: [
    {
      path: 'SKILL.md',
      contentBase64: Buffer.from(markdown).toString('base64'),
      mediaType: 'text/markdown',
    },
  ],
};
const skill = {
  id: 'skill',
  ...scope,
  name: input.name,
  description: input.description,
  version: 2,
  currentVersion: 2,
  enabled: true,
  publishedVersion: 1,
  fileCount: 1,
  totalBytes: markdown.length,
  createdAt: new Date('2026-09-10T00:00:00Z'),
  updatedAt: new Date('2026-09-10T00:00:00Z'),
} as SkillEntity;
function fixture(options: { usage?: number; quota?: number; found?: SkillEntity | null } = {}) {
  const skillRepository = {
    findOne: vi.fn().mockResolvedValue(options.found === undefined ? skill : options.found),
    create: vi.fn((value: unknown) => value),
    save: vi.fn().mockResolvedValue({
      ...skill,
      version: 1,
      currentVersion: 1,
      enabled: true,
      publishedVersion: null,
    }),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    delete: vi.fn().mockResolvedValue({ affected: 1 }),
  };
  const builder = {
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    getRawOne: vi.fn().mockResolvedValue({ bytes: String(options.usage ?? 0) }),
  };
  const versions = {
    maximum: vi.fn().mockResolvedValue(2),
    findOneBy: vi.fn().mockResolvedValue({
      version: 1,
      name: input.name,
      description: input.description,
      totalBytes: markdown.length,
    }),
    insert: vi.fn(),
    update: vi.fn(),
    createQueryBuilder: vi.fn().mockReturnValue(builder),
  };
  const files = {
    insert: vi.fn(),
    find: vi
      .fn()
      .mockResolvedValue([
        { path: 'SKILL.md', content: Buffer.from(markdown), mediaType: 'text/markdown' },
      ]),
  };
  const users = { findOneOrFail: vi.fn().mockResolvedValue({ id: 'owner' }) };
  const repositories = new Map<unknown, unknown>([
    [SkillEntity, skillRepository],
    [SkillVersionEntity, versions],
    [SkillFileEntity, files],
    [UserEntity, users],
  ]);
  const manager = {
    getRepository: vi.fn((entity) => repositories.get(entity)),
  } as unknown as EntityManager;
  const db = {
    transaction: vi.fn(async (...args: unknown[]) => {
      const callback = args.at(-1) as (m: EntityManager) => unknown;
      return await callback(manager);
    }),
  };
  const tenants = { scopeFor: vi.fn().mockResolvedValue(scope) } as unknown as TenantsService;
  const service = new SkillsService(
    db as unknown as DataSource,
    tenants,
    new ConfigService({ SKILLS_MAX_TOTAL_BYTES_PER_USER: options.quota ?? 26214400 }),
  );
  return { service, db, skillRepository, versions, files, users };
}
describe('skills atomic lifecycle', () => {
  it('requires owner locking and CAS before resolving a restore source', async () => {
    const { service, versions, users } = fixture();
    await expect(
      service.restore(principal, 'skill', { expectedVersion: 1, sourceVersion: 1 }),
    ).rejects.toMatchObject({ code: 'skill_version_conflict' });
    expect(users.findOneOrFail).toHaveBeenCalledOnce();
    expect(versions.findOneBy).not.toHaveBeenCalled();
    await service.restore(principal, 'skill', { expectedVersion: 2, sourceVersion: 2 });
    expect(versions.insert).not.toHaveBeenCalled();
  });
  it('rejects unavailable sources but repoints existing snapshots even above quota', async () => {
    const missing = fixture();
    missing.versions.findOneBy.mockResolvedValue(null);
    await expect(
      missing.service.restore(principal, 'skill', { expectedVersion: 2, sourceVersion: 9 }),
    ).rejects.toMatchObject({ code: 'skill_not_found' });
    expect(missing.files.insert).not.toHaveBeenCalled();
    const limited = fixture({ usage: 100, quota: 100 });
    await limited.service.restore(principal, 'skill', { expectedVersion: 2, sourceVersion: 1 });
    expect(limited.skillRepository.update).toHaveBeenCalledWith(
      { id: 'skill', ...scope },
      expect.objectContaining({ currentVersion: 1, version: 3 }),
    );
    expect(limited.files.insert).not.toHaveBeenCalled();
    expect(limited.versions.update).not.toHaveBeenCalled();
    expect(limited.versions.createQueryBuilder).not.toHaveBeenCalled();
    expect(limited.versions.insert).not.toHaveBeenCalled();
  });
  it('allocates max retained snapshot plus one after rollback, independent of CAS', async () => {
    const { service, versions, skillRepository } = fixture({
      found: { ...skill, version: 8, currentVersion: 1 },
    });
    versions.maximum.mockResolvedValue(5);
    await service.update(principal, 'skill', {
      ...input,
      expectedVersion: 8,
      files: [
        ...input.files,
        { path: 'extra.txt', mediaType: 'text/plain', contentBase64: 'eA==' },
      ],
    });
    expect(versions.maximum).toHaveBeenCalledWith('version', { skillId: 'skill' });
    expect(versions.insert).toHaveBeenCalledWith(expect.objectContaining({ version: 6 }));
    expect(skillRepository.update).toHaveBeenCalledWith(
      { id: 'skill', ...scope },
      expect.objectContaining({ currentVersion: 6, version: 9 }),
    );
  });
  it('does not allocate bytes or versions on a current identical save even at quota', async () => {
    const { service, versions } = fixture({ usage: 100, quota: 100 });
    await service.update(principal, 'skill', { ...input, expectedVersion: 2 });
    expect(versions.insert).not.toHaveBeenCalled();
    await expect(
      service.update(principal, 'skill', { ...input, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'skill_version_conflict' });
  });

  it('keeps the published pointer while showing a newer draft', () => {
    expect(toSkillSummary(skill)).toMatchObject({
      status: 'draft',
      version: 2,
      enabled: true,
      publishedVersion: 1,
    });
    expect(toSkillSummary({ ...skill, enabled: true, publishedVersion: 2 })).toMatchObject({
      status: 'published',
    });
    expect(() => assertSkillVersion(skill, 1)).toThrow('Reload');
  });
  it('validates packages before entering a transaction', async () => {
    const { service, db } = fixture();
    await expect(service.create(principal, { ...input, files: [] })).rejects.toMatchObject({
      code: 'skill_package_invalid',
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it('counts retained versions against quota before allocating a package', async () => {
    const { service, files, users } = fixture({ usage: 100, quota: 110 });
    await expect(service.create(principal, input)).rejects.toMatchObject({
      code: 'skill_storage_quota_exceeded',
    });
    expect(users.findOneOrFail).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'owner', tenantId: 'tenant' },
        lock: { mode: 'for_no_key_update' },
      }),
    );
    expect(files.insert).not.toHaveBeenCalled();
  });
  it('persists the entire package and hash in the same transaction', async () => {
    const { service, db, versions, files } = fixture();
    const result = await service.create(principal, input);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(versions.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/u) as unknown,
      }),
    );
    expect(files.insert).toHaveBeenCalledWith([
      expect.objectContaining({ path: 'SKILL.md', content: Buffer.from(markdown), version: 1 }),
    ]);
    expect(result.files).toEqual(input.files);
  });
  it('blocks stale edits, publication and deletion before writes', async () => {
    const { service, versions, skillRepository } = fixture();
    await expect(
      service.update(principal, 'skill', { ...input, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'skill_version_conflict' });
    await expect(service.publish(principal, 'skill', 1)).rejects.toMatchObject({
      code: 'skill_version_conflict',
    });
    await expect(service.remove(principal, 'skill', 1)).rejects.toMatchObject({
      code: 'skill_version_conflict',
    });
    expect(versions.insert).not.toHaveBeenCalled();
    expect(skillRepository.update).not.toHaveBeenCalled();
    expect(skillRepository.delete).not.toHaveBeenCalled();
  });
  it('creates a new version on editing without overwriting the published version', async () => {
    const { service, versions, skillRepository } = fixture();
    await service.update(principal, 'skill', {
      ...input,
      files: [
        ...input.files,
        { path: 'extra.txt', mediaType: 'text/plain', contentBase64: 'eA==' },
      ],
      expectedVersion: 2,
    });
    expect(versions.insert).toHaveBeenCalledWith(
      expect.objectContaining({ version: 3, publishedAt: null }),
    );
    expect(skillRepository.update).toHaveBeenCalledWith(
      { id: 'skill', ...scope },
      expect.objectContaining({ version: 3 }),
    );
    expect(skillRepository.update.mock.calls[0]?.[1]).not.toHaveProperty('publishedVersion');
  });
  it('publishes exactly the expected immutable version', async () => {
    const { service, versions, skillRepository } = fixture();
    await service.publish(principal, 'skill', 2);
    expect(versions.update).toHaveBeenCalledWith(
      { skillId: 'skill', version: 2 },
      { publishedAt: expect.any(Date) as unknown },
    );
    expect(skillRepository.update).toHaveBeenCalledWith(
      { id: 'skill', ...scope },
      { publishedVersion: 2, version: 3 },
    );
  });
  it('returns a scoped not-found without leaking another owner data', async () => {
    const { service, files } = fixture({ found: null });
    await expect(service.get(principal, 'skill')).rejects.toMatchObject({
      code: 'skill_not_found',
    });
    expect(files.find).not.toHaveBeenCalled();
  });
  it('purges only the caller-owned skill after CAS', async () => {
    const { service, skillRepository } = fixture();
    await service.remove(principal, 'skill', 2);
    expect(skillRepository.delete).toHaveBeenCalledWith({ id: 'skill', ...scope });
  });
  it('translates duplicate names without exposing database diagnostics', async () => {
    const { service, skillRepository } = fixture();
    skillRepository.save.mockRejectedValue(
      new QueryFailedError(
        'PRIVATE SQL',
        [],
        Object.assign(new Error('database detail'), { constraint: 'uq_skills_owner_name' }),
      ),
    );
    await expect(service.create(principal, input)).rejects.toMatchObject({
      code: 'skill_name_conflict',
    });
  });
});
