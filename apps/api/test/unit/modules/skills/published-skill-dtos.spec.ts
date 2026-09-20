import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { PublishedSkillListQueryDto } from '@api/modules/skills/api/skill.dto';

const strict = { whitelist: true, forbidNonWhitelisted: true };

describe('published skill list query DTO', () => {
  it('accepts an absent filter and an exact skill name', async () => {
    expect(plainToInstance(PublishedSkillListQueryDto, {}).limit).toBe(20);
    expect(await validate(plainToInstance(PublishedSkillListQueryDto, {}), strict)).toEqual([]);
    expect(
      await validate(
        plainToInstance(PublishedSkillListQueryDto, { name: 'incident-runbook', limit: '5' }),
        strict,
      ),
    ).toEqual([]);
  });
  it('refuses patterns, oversized names, other scopes and unbounded pages', async () => {
    for (const query of [
      { name: '' },
      { name: 'Incident' },
      { name: 'incident_runbook' },
      { name: '%' },
      { name: 'a'.repeat(65) },
      { name: ['one', 'two'] },
      { limit: '101' },
      { ownerUserId: 'foreign' },
      { enabled: 'false' },
    ]) {
      expect(
        await validate(plainToInstance(PublishedSkillListQueryDto, query), strict),
        JSON.stringify(query),
      ).not.toEqual([]);
    }
  });
});
