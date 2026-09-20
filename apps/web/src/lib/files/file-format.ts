import {
  FILE_MAX_TAGS,
  FILE_TAG_MAX_LENGTH,
  type FileFailureCode,
  type FileQuota,
  type StoredFile,
} from '@alfred/contracts';

const KIB = 1024;
const MIB = KIB * KIB;
const sizeNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

const rounded = (value: number) => Math.round(value * 10) / 10;

/** Binary sizes in French: « 12,4 Mio », « 512 Kio », « 900 octets ». */
export function formatFileSize(bytes: number): string {
  if (bytes < KIB) return `${sizeNumber.format(bytes)} octet${bytes > 1 ? 's' : ''}`;
  // A value that would round up to « 1 024 Kio » reads as one mebibyte instead.
  if (rounded(bytes / KIB) < KIB) return `${sizeNumber.format(rounded(bytes / KIB))} Kio`;
  return `${sizeNumber.format(rounded(bytes / MIB))} Mio`;
}

/** Capacity no new upload can use: what is stored plus what uploads in flight have reserved. */
export function quotaTakenBytes(quota: FileQuota): number {
  return Math.min(quota.limitBytes, quota.usedBytes + quota.reservedBytes);
}

/** « 12,4 Mio sur 25 Mio » */
export function formatQuota(quota: FileQuota): string {
  return `${formatFileSize(quotaTakenBytes(quota))} sur ${formatFileSize(quota.limitBytes)}`;
}

const plural = (count: number, singular: string, many: string) =>
  `${count} ${count > 1 ? many : singular}`;

/** « joint à 3 messages dans 2 conversations », or null for a file never sent. */
export function describeFileUsage(usage: StoredFile['usage']): string | null {
  if (usage.messages === 0) return null;
  return `joint à ${plural(usage.messages, 'message', 'messages')} dans ${plural(
    usage.conversations,
    'conversation',
    'conversations',
  )}`;
}

/** What a deletion costs, stated before it happens: the transcripts keep what was already sent. */
export function describeFileDeletion(file: Pick<StoredFile, 'name' | 'usage'>): string {
  const usage = describeFileUsage(file.usage);
  return usage === null
    ? `« ${file.name} » sera supprimé définitivement de vos fichiers.`
    : `« ${file.name} » est ${usage}. Il sera supprimé définitivement de vos fichiers ; le texte déjà envoyé reste dans ces conversations, où le fichier apparaîtra comme supprimé.`;
}

/** The same warning for a selection: how many of its files conversations already carry. */
export function describeBulkDeletion(files: readonly Pick<StoredFile, 'usage'>[]): string {
  const messages = files.reduce((total, file) => total + file.usage.messages, 0);
  const sent = files.filter((file) => file.usage.messages > 0).length;
  const base = `${plural(files.length, 'fichier sera supprimé', 'fichiers seront supprimés')} définitivement.`;
  return sent === 0
    ? base
    : `${base} ${plural(sent, 'fichier est joint', 'fichiers sont joints')} à ${plural(
        messages,
        'message',
        'messages',
      )} : le texte déjà envoyé reste dans les conversations.`;
}

const FAILURE_MESSAGES: Readonly<Record<FileFailureCode, string>> = Object.freeze({
  no_readable_text: 'Aucun texte lisible n’a été trouvé dans ce document.',
  parser_error: 'Ce document n’a pas pu être lu.',
  timeout: 'L’analyse de ce fichier a pris trop de temps.',
  too_large: 'Ce document est trop volumineux pour être analysé.',
  unsupported: 'Ce contenu n’est pas pris en charge.',
});

/** Why the agent cannot use a file whose analysis failed. */
export function describeFileFailure(code: FileFailureCode | null): string {
  return code === null ? 'L’analyse de ce fichier a échoué.' : FAILURE_MESSAGES[code];
}

/** Comma-separated input to the tag list the API accepts: trimmed, unique, bounded. */
export function parseTags(input: string): string[] {
  const tags: string[] = [];
  for (const raw of input.split(',')) {
    const tag = raw.trim().slice(0, FILE_TAG_MAX_LENGTH).trim();
    if (tag !== '' && !tags.some((known) => known.toLowerCase() === tag.toLowerCase()))
      tags.push(tag);
    if (tags.length === FILE_MAX_TAGS) break;
  }
  return tags;
}
