import { ApiException } from '../../../common/errors/api.exception';

export function assertSkillVersion(
  skill: { readonly version: number },
  expectedVersion: number,
): void {
  if (skill.version !== expectedVersion)
    throw new ApiException(
      409,
      'skill_version_conflict',
      'The skill changed. Reload before saving.',
    );
}

export function compareSkillPath(
  left: { readonly path: string },
  right: { readonly path: string },
): number {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;
  return 0;
}
