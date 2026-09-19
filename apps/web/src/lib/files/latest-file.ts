import type { StoredFile } from '@alfred/contracts';

/** Of two answers about one file, the one the API wrote last; a list row and a single read may differ. */
export function latestFile(listed: StoredFile, read: StoredFile | undefined): StoredFile {
  return read !== undefined && read.id === listed.id && read.updatedAt >= listed.updatedAt
    ? read
    : listed;
}
