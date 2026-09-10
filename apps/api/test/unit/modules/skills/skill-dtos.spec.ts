import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { SkillUpdateDto, SkillWriteDto } from '@api/modules/skills/api/skill.dto';

describe('skill request boundaries', () => {
  const valid = {
    name: 'review-code',
    description: 'Review changes',
    files: [{ path: 'SKILL.md', contentBase64: 'eA==', mediaType: 'text/markdown' }],
  };
  it('accepts a concrete nested package and rejects owner injection', async () => {
    expect(await validate(plainToInstance(SkillWriteDto, valid))).toEqual([]);
    expect(
      await validate(plainToInstance(SkillWriteDto, { ...valid, tenantId: 'injected' }), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).not.toEqual([]);
  });
  it('requires integer CAS version and validates nested files', async () => {
    for (const input of [
      { ...valid },
      { ...valid, expectedVersion: '1' },
      { ...valid, expectedVersion: 0 },
      { ...valid, expectedVersion: 1, files: [{ path: 'SKILL.md' }] },
    ]) {
      expect(await validate(plainToInstance(SkillUpdateDto, input))).not.toEqual([]);
    }
  });
});
