import { describe, expect, it } from 'vitest';
import { skillError } from '@/lib/skills/skill-errors';
import { ApiRequestError } from '@/services/http/api-json';

describe('Skill error messages', () => {
  it('preserves actionable package validation details for its explicit business code', () => {
    expect(
      skillError(new ApiRequestError(400, 'skill_package_invalid', 'SKILL.md est obligatoire.')),
    ).toBe('SKILL.md est obligatoire.');
  });

  it.each([
    new ApiRequestError(400, 'HTTP_400', 'Internal validation details'),
    new ApiRequestError(500, 'unexpected', 'Internal server details'),
    new Error('Internal client details'),
    { code: 'skill_package_invalid', message: 'Unvalidated error' },
  ])('keeps unexpected messages private', (error) => {
    expect(skillError(error)).not.toMatch(/Internal|Unvalidated/);
  });

  it('explains that retained history contributes to the storage quota', () => {
    expect(
      skillError(new ApiRequestError(400, 'skill_storage_quota_exceeded', 'Quota exceeded')),
    ).toContain('L’historique conservé compte aussi dans votre quota.');
  });
});
