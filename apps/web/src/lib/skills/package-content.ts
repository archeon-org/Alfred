import { SKILL_MAX_INSTRUCTIONS_BYTES, type SkillFileInput } from '@alfred/contracts';
import { parseDocument, stringify } from 'yaml';

export function packageError(message: string): never {
  throw new Error(message);
}

export function assertPackagePath(path: string): void {
  if (
    path.length > 240 ||
    path !== path.normalize('NFC') ||
    /[\\:\p{Cc}]/u.test(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..' || part.trim() !== part)
  ) {
    packageError('Chemin invalide : utilisez un chemin relatif sans segment . ou ...');
  }
}

export function decodeUtf8(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0'))
      packageError('Les fichiers texte ne doivent pas contenir de caractère NUL.');
    return text;
  } catch {
    return packageError('Les fichiers Markdown doivent être en UTF-8.');
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  // Avoid spreading a user-controlled byte array into function arguments.
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

export function base64ToBytes(value: string): Uint8Array {
  try {
    const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    if (bytesToBase64(bytes) !== value) packageError('Contenu base64 invalide.');
    return bytes;
  } catch {
    return packageError('Contenu base64 invalide.');
  }
}

export function mediaTypeForPath(path: string): string {
  if (/\.md$/iu.test(path)) return 'text/markdown';
  if (/\.(txt|py|js|ts|sh|yaml|yml|csv)$/iu.test(path)) return 'text/plain';
  if (/\.json$/iu.test(path)) return 'application/json';
  return 'application/octet-stream';
}

export function encodeSkillFile(
  path: string,
  content: string,
  mediaType = mediaTypeForPath(path),
): SkillFileInput {
  return { path, contentBase64: bytesToBase64(new TextEncoder().encode(content)), mediaType };
}

export function decodeSkillFile(file: SkillFileInput): string {
  return decodeUtf8(base64ToBytes(file.contentBase64));
}

function frontmatter(markdown: string) {
  if (new TextEncoder().encode(markdown).byteLength > SKILL_MAX_INSTRUCTIONS_BYTES)
    packageError('SKILL.md dépasse 128 Kio.');
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(markdown);
  if (!match) {
    if (/^---(?:\r?\n|$)/u.test(markdown)) packageError('En-tête YAML incomplet.');
    return { document: undefined, body: markdown };
  }
  if (!match[1] || new TextEncoder().encode(match[1]).byteLength > 16_384)
    packageError('En-tête YAML trop volumineux ou vide.');
  try {
    const document = parseDocument(match[1], { schema: 'core', customTags: [], uniqueKeys: true });
    if (document.errors.length || document.warnings.length) packageError('En-tête YAML invalide.');
    const metadata: unknown = document.toJS({ maxAliasCount: 0 });
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))
      packageError('En-tête YAML invalide.');
    return { document, body: markdown.slice(match[0].length) };
  } catch {
    return packageError('En-tête YAML invalide : les alias et tags personnalisés sont interdits.');
  }
}

export function readSkillMetadata(markdown: string): { name: string; description: string } {
  const { document } = frontmatter(markdown);
  const name: unknown = document?.get('name');
  const description: unknown = document?.get('description');
  if (
    (name !== undefined && typeof name !== 'string') ||
    (description !== undefined && typeof description !== 'string')
  )
    packageError('Le nom et la description doivent être du texte.');
  return {
    name: typeof name === 'string' ? name : '',
    description: typeof description === 'string' ? description : '',
  };
}

export function normalizeSkillMarkdown(
  markdown: string,
  name: string,
  description: string,
): string {
  const { document, body } = frontmatter(markdown);
  if (document) {
    if (document.get('name') === name && document.get('description') === description)
      return markdown;
    const next = document.clone();
    next.set('name', name);
    next.set('description', description);
    return `---\n${next.toString()}---\n${body}`;
  }
  return `---\n${stringify({ name, description })}---\n${body}`;
}
