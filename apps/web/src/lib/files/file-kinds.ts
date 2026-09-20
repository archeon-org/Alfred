import {
  FILE_ACCEPTED_EXTENSIONS,
  FILE_MAX_BYTES,
  FILE_MEDIA_TYPES,
  FILE_NAME_MAX_LENGTH,
  FILE_SIGNATURE_BYTES,
  sniffFileType,
  type FileKind,
  type FileReadiness,
} from '@alfred/contracts';

/** `accept` of every file picker: the extensions people recognise, then their media types. */
export const FILE_INPUT_ACCEPT = [
  ...FILE_ACCEPTED_EXTENSIONS,
  ...Object.values(FILE_MEDIA_TYPES),
].join(',');

export const FILE_KIND_LABELS: Readonly<Record<FileKind, string>> = Object.freeze({
  pdf: 'PDF',
  docx: 'DOCX',
  image: 'Image',
});

export const FILE_READINESS_LABELS: Readonly<Record<FileReadiness, string>> = Object.freeze({
  ready: 'Prêt',
  processing: 'En cours',
  failed: 'Échec',
});

const EXTENSION_KINDS: Readonly<Record<string, FileKind>> = Object.freeze({
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.gif': 'image',
});

/** Why the browser refuses a file before any request; the API stays the authority. */
export type FileRejection =
  | 'empty'
  | 'too_large'
  | 'name_too_long'
  | 'unsupported_extension'
  | 'unsupported_content'
  /** The browser could not read the bytes (file moved, permission lost). */
  | 'unreadable';

export type FileCheck =
  | { readonly ok: true; readonly kind: FileKind; readonly mediaType: string }
  | { readonly ok: false; readonly reason: FileRejection };

/** What the checks read from a `File`; tests and callers may pass a plain object. */
export interface FileCandidate {
  readonly name: string;
  readonly size: number;
}

/** The lowercase extension with its dot, or an empty string when the name has none. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

/** The kind a file name announces; only a hint, since the bytes decide. */
export function kindFromName(name: string): FileKind | null {
  return EXTENSION_KINDS[fileExtension(name)] ?? null;
}

/** The checks that need no bytes: size, name length and the extension allow-list. */
export function checkFileCandidate(
  file: FileCandidate,
  maxBytes: number = FILE_MAX_BYTES,
): FileRejection | null {
  if (file.size <= 0) return 'empty';
  if (file.size > maxBytes) return 'too_large';
  if (file.name.length > FILE_NAME_MAX_LENGTH) return 'name_too_long';
  if (kindFromName(file.name) === null) return 'unsupported_extension';
  return null;
}

/**
 * The early refusal shared by the composer, the panel and the explorer: the candidate checks, then
 * the type the leading bytes declare. A page saved as `photo.png` is refused here, whatever its
 * name; a JPEG named `.png` passes, as it does on the API, which decides from the bytes alone.
 */
export function validateFile(
  file: FileCandidate,
  signature: Uint8Array,
  maxBytes: number = FILE_MAX_BYTES,
): FileCheck {
  const rejection = checkFileCandidate(file, maxBytes);
  if (rejection !== null) return { ok: false, reason: rejection };
  const sniffed = sniffFileType(signature);
  if (sniffed === null) return { ok: false, reason: 'unsupported_content' };
  return { ok: true, kind: sniffed.kind, mediaType: sniffed.mediaType };
}

/** The leading bytes `sniffFileType` needs, read without loading the whole file. */
export async function readFileSignature(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, FILE_SIGNATURE_BYTES).arrayBuffer());
}
