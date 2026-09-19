import { createHash } from 'node:crypto';

/** Lowercase hexadecimal SHA-256: the identity of a file's bytes for integrity and deduplication. */
export function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
