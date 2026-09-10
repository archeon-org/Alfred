import type { SkillFileInput } from '@alfred/contracts';

export interface SkillFileNode {
  readonly kind: 'file' | 'folder';
  readonly name: string;
  readonly path: string;
  readonly children: readonly SkillFileNode[];
}

/** Derive folders from paths without modifying the package or storing empty folders. */
export function buildSkillFileTree(
  files: readonly Pick<SkillFileInput, 'path'>[],
  prefix = '',
): readonly SkillFileNode[] {
  const names = [...new Set(files.map((file) => file.path.slice(prefix.length).split('/')[0]!))];
  return names
    .map((name): SkillFileNode => {
      const path = `${prefix}${name}`;
      const descendants = files.filter((file) => file.path.startsWith(`${path}/`));
      return descendants.length
        ? { kind: 'folder', name, path, children: buildSkillFileTree(descendants, `${path}/`) }
        : { kind: 'file', name, path, children: [] };
    })
    .sort((left, right) => {
      if (left.path === 'SKILL.md') return -1;
      if (right.path === 'SKILL.md') return 1;
      if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
}
