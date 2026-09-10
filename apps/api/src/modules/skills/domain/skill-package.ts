import {
  SKILL_MAX_FILES,
  SKILL_MAX_INSTRUCTIONS_BYTES,
  SKILL_MAX_PACKAGE_BYTES,
  type SkillFileInput,
} from '@alfred/contracts';
import { parseDocument } from 'yaml';

export type { SkillFileInput } from '@alfred/contracts';

export interface SkillPackageLimits {
  maxFiles: number;
  maxPackageBytes: number;
  maxSkillMarkdownBytes: number;
}

export interface ValidatedSkillFile {
  path: string;
  content: Buffer;
  mediaType: string;
  sizeBytes: number;
}

export class SkillPackageValidationError extends Error {
  readonly code = 'SKILL_PACKAGE_INVALID';
}

function invalid(message: string): never {
  throw new SkillPackageValidationError(message);
}

function validatePath(path: string): void {
  if (
    path.length > 240 ||
    path !== path.normalize('NFC') ||
    /[\\:\p{Cc}]/u.test(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..' || part.trim() !== part)
  )
    invalid('Le chemin du fichier est invalide.');
}

function decodeContent(file: SkillFileInput, maxBytes: number): Buffer {
  if (file.contentBase64.length > Math.ceil(maxBytes / 3) * 4)
    invalid('Le package dépasse la taille autorisée.');
  const content = Buffer.from(file.contentBase64, 'base64');
  if (content.toString('base64') !== file.contentBase64)
    invalid('Le contenu du fichier doit être encodé en base64 canonique.');
  if (
    !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/u.test(file.mediaType) ||
    file.mediaType.length > 127
  )
    invalid('Le type du fichier est invalide.');
  if (/\.md$/iu.test(file.path)) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(content);
      if (text.includes('\0'))
        invalid('Les fichiers Markdown ne doivent pas contenir de caractère NUL.');
    } catch {
      invalid('Les fichiers Markdown doivent être en UTF-8.');
    }
  }
  return content;
}

function validateMetadata(content: Buffer, name: string, description: string): void {
  const markdown = new TextDecoder('utf-8', { fatal: true }).decode(content);
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(markdown);
  if (!match?.[1] || Buffer.byteLength(match[1]) > 16_384)
    invalid('SKILL.md doit contenir un en-tête YAML valide.');
  try {
    const document = parseDocument(match[1], { schema: 'core', customTags: [], uniqueKeys: true });
    if (document.errors.length || document.warnings.length) invalid('En-tête YAML invalide.');
    const metadata: unknown = document.toJS({ maxAliasCount: 0 });
    if (
      typeof metadata !== 'object' ||
      metadata === null ||
      Array.isArray(metadata) ||
      !('name' in metadata) ||
      metadata.name !== name ||
      !('description' in metadata) ||
      metadata.description !== description
    )
      invalid('Le nom et la description doivent correspondre à SKILL.md.');
  } catch {
    invalid('En-tête YAML invalide ou métadonnées incohérentes.');
  }
}

export function validateSkillPackage(
  input: { name: string; description: string; files: SkillFileInput[] },
  overrides: Partial<SkillPackageLimits> = {},
): ValidatedSkillFile[] {
  const limits = {
    maxFiles: SKILL_MAX_FILES,
    maxPackageBytes: SKILL_MAX_PACKAGE_BYTES,
    maxSkillMarkdownBytes: SKILL_MAX_INSTRUCTIONS_BYTES,
    ...overrides,
  };
  if (!input.files.length || input.files.length > limits.maxFiles)
    invalid('Nombre de fichiers non autorisé.');
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.name) ||
    input.name.length > 64 ||
    !input.description.trim() ||
    input.description.length > 1024
  )
    invalid('Nom ou description invalide.');
  const paths = input.files.map((file) => file.path.normalize('NFC').toLowerCase());
  if (new Set(paths).size !== paths.length) invalid('Le package contient des chemins dupliqués.');
  if (paths.some((path) => paths.some((other) => other.startsWith(`${path}/`))))
    invalid('Un chemin désigne à la fois un fichier et un dossier.');
  const files = input.files.map((file) => {
    validatePath(file.path);
    const content = decodeContent(file, limits.maxPackageBytes);
    return { path: file.path, content, mediaType: file.mediaType, sizeBytes: content.byteLength };
  });
  if (files.reduce((total, file) => total + file.sizeBytes, 0) > limits.maxPackageBytes)
    invalid('Le package dépasse la taille autorisée.');
  const instructions = files.find((file) => file.path === 'SKILL.md');
  if (!instructions) invalid('Le package doit contenir SKILL.md à la racine.');
  if (instructions.sizeBytes > limits.maxSkillMarkdownBytes)
    invalid('SKILL.md dépasse la taille autorisée.');
  validateMetadata(instructions.content, input.name, input.description);
  return files;
}
