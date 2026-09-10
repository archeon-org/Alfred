import { SKILL_MAX_FILES, SKILL_MAX_PACKAGE_BYTES, type SkillFileInput } from '@alfred/contracts';
import { Zip, ZipPassThrough } from 'fflate';
import {
  assertPackagePath,
  base64ToBytes,
  bytesToBase64,
  decodeSkillFile,
  decodeUtf8,
  mediaTypeForPath,
  packageError,
  readSkillMetadata,
} from './package-content';
import { readSkillZip } from './package-zip';

export type { SkillFileInput } from '@alfred/contracts';
export { decodeSkillFile, encodeSkillFile, normalizeSkillMarkdown } from './package-content';

export interface ImportedSkillPackage {
  name: string;
  description: string;
  files: SkillFileInput[];
}

function readFile(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
    reader.readAsArrayBuffer(file);
  });
}

function checkFiles(files: SkillFileInput[]): void {
  if (!files.length || files.length > SKILL_MAX_FILES)
    packageError('Le package doit contenir entre 1 et 50 fichiers.');
  if (!files.some((file) => file.path === 'SKILL.md'))
    packageError('Ajoutez SKILL.md à la racine du package.');
  const paths = files.map((file) => file.path.normalize('NFC').toLowerCase());
  if (new Set(paths).size !== files.length)
    packageError('Le package contient des chemins dupliqués.');
  if (paths.some((path) => paths.some((other) => other.startsWith(`${path}/`))))
    packageError('Un chemin désigne à la fois un fichier et un dossier.');
  let totalBytes = 0;
  for (const file of files) {
    assertPackagePath(file.path);
    const content = base64ToBytes(file.contentBase64);
    totalBytes += content.length;
    if (totalBytes > SKILL_MAX_PACKAGE_BYTES) packageError('Le package dépasse 1 Mio.');
    if (/\.md$/iu.test(file.path)) decodeUtf8(content);
  }
}

export async function importSkillPackage(file: File): Promise<ImportedSkillPackage> {
  // ZIP headers add overhead to a package containing at most 1 MiB of content.
  if (file.size > SKILL_MAX_PACKAGE_BYTES + 65_536)
    packageError('Le fichier importé est trop volumineux.');
  if (!/\.(md|zip)$/iu.test(file.name))
    packageError('Importez un fichier Markdown (.md) ou un package ZIP (.zip).');
  const bytes = new Uint8Array(await readFile(file));
  const entries = /\.zip$/iu.test(file.name)
    ? readSkillZip(bytes)
    : [{ path: 'SKILL.md', content: bytes }];
  const files = entries.map(({ path, content }) => ({
    path,
    contentBase64: bytesToBase64(content),
    mediaType: mediaTypeForPath(path),
  }));
  checkFiles(files);
  const instructions = files.find((entry) => entry.path === 'SKILL.md');
  if (!instructions) return packageError('SKILL.md est requis.');
  return { ...readSkillMetadata(decodeSkillFile(instructions)), files };
}

export function exportSkillPackage(skill: ImportedSkillPackage): Promise<Blob> {
  checkFiles(skill.files);
  if (skill.files.length === 1)
    return Promise.resolve(
      new Blob([new Uint8Array(base64ToBytes(skill.files[0]!.contentBase64)).buffer], {
        type: 'text/markdown;charset=utf-8',
      }),
    );
  return new Promise((resolve, reject) => {
    const chunks: ArrayBuffer[] = [];
    const zip = new Zip((error, data, final) => {
      if (error) {
        reject(error);
        return;
      }
      chunks.push(new Uint8Array(data).buffer);
      if (final) resolve(new Blob(chunks, { type: 'application/zip' }));
    });
    // Filename-based entries avoid interpreting user paths as JavaScript keys.
    for (const file of skill.files) {
      const entry = new ZipPassThrough(file.path);
      zip.add(entry);
      entry.push(base64ToBytes(file.contentBase64), true);
    }
    zip.end();
  });
}
