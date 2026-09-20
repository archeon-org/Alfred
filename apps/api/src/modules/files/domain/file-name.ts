import { FILE_NAME_MAX_LENGTH, FOLDER_NAME_MAX_LENGTH } from '@alfred/contracts';

/**
 * Control characters, and the bidirectional and zero-width marks that make a name display as
 * something it is not (a right-to-left override turns `invoice[RLO]fdp.exe` into `invoiceexe.pdf`).
 */
const UNSAFE_CHARACTERS = /[\p{Cc}\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu;
const PATH_SEPARATORS = /[/\\:]/gu;

function clean(value: string): string {
  return value
    .normalize('NFC')
    .replace(UNSAFE_CHARACTERS, '')
    .replace(PATH_SEPARATORS, '-')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** The case-folded form two siblings may not share. */
export function nameKey(name: string): string {
  return name.normalize('NFC').toLocaleLowerCase('en-US');
}

/**
 * A display name for a stored file. A browser sends whatever the user's disk held, sometimes a
 * whole path; the extension always comes from the detected type, never from the upload.
 */
export function sanitizeFileName(declared: string, extension: string): string {
  const base = clean(declared.split(/[/\\]/u).pop() ?? '');
  const withoutExtension = base.replace(/\.[^.\s]{1,10}$/u, '').replace(/^\.+/u, '');
  const stem = withoutExtension.length === 0 ? 'fichier' : withoutExtension;
  return `${stem.slice(0, FILE_NAME_MAX_LENGTH - extension.length)}${extension}`;
}

/** A user-chosen file name on rename: cleaned, kept within bounds, extension preserved. */
export function normalizeFileRename(requested: string, extension: string): string | null {
  const cleaned = clean(requested);
  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') return null;
  return sanitizeFileName(cleaned, extension);
}

export function normalizeFolderName(requested: string): string | null {
  const cleaned = clean(requested).slice(0, FOLDER_NAME_MAX_LENGTH).trim();
  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') return null;
  return cleaned;
}

/** `rapport.pdf` → `rapport (2).pdf`: how a repeated upload of the same name stays distinct. */
export function suffixedName(name: string, attempt: number): string {
  if (attempt <= 1) return name;
  const dot = name.lastIndexOf('.');
  const suffix = ` (${attempt})`;
  const stem = dot <= 0 ? name : name.slice(0, dot);
  const extension = dot <= 0 ? '' : name.slice(dot);
  return `${stem.slice(0, FILE_NAME_MAX_LENGTH - suffix.length - extension.length)}${suffix}${extension}`;
}
