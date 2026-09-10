import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  SkillAvailabilityDto,
  SkillRestoreDto,
  SkillVersionsQueryDto,
} from '@api/modules/skills/api/skill.dto';

describe('skill lifecycle DTOs', () => {
  it('requires actual booleans and positive integer CAS/source versions', async () => {
    expect(
      await validate(plainToInstance(SkillAvailabilityDto, { expectedVersion: 1, enabled: false })),
    ).toEqual([]);
    for (const enabled of ['false', 0, null, undefined]) {
      expect(
        await validate(plainToInstance(SkillAvailabilityDto, { expectedVersion: 1, enabled })),
      ).not.toEqual([]);
    }
    for (const sourceVersion of [0, -1, 1.5, '1', null]) {
      expect(
        await validate(plainToInstance(SkillRestoreDto, { expectedVersion: 1, sourceVersion })),
      ).not.toEqual([]);
    }
    expect(
      await validate(plainToInstance(SkillRestoreDto, { expectedVersion: 1, sourceVersion: 2 })),
    ).toEqual([]);
  });
  it('bounds and transforms history pagination without permitting owner injection', async () => {
    expect(plainToInstance(SkillVersionsQueryDto, {}).limit).toBe(20);
    expect(
      await validate(plainToInstance(SkillVersionsQueryDto, { before: '2', limit: '20' })),
    ).toEqual([]);
    for (const query of [
      { before: '0' },
      { before: '1.5' },
      { before: '' },
      { limit: '0' },
      { limit: '101' },
      { tenantId: 'foreign' },
    ]) {
      expect(
        await validate(plainToInstance(SkillVersionsQueryDto, query), {
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      ).not.toEqual([]);
    }
  });
});
