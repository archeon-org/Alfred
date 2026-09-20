/**
 * The byte boundary of ALF-DEC-054 and ALF-DEC-029: durable metadata, revisions and quotas stay
 * in PostgreSQL, while the exact bytes live behind this port under an opaque `contentId`. No
 * caller supplies a storage namespace, and no caller receives a provider address, a bucket name
 * or a credential. The port has no list, search, owner or quota concept: the product layer owns
 * authorization and tenant isolation, and resolves every `contentId` from one of its own rows.
 */
export interface StoredContent {
  readonly byteSize: number;
  /** Lowercase hexadecimal SHA-256 of the stored bytes. */
  readonly sha256: string;
}

export interface ContentStoreCallOptions {
  readonly signal?: AbortSignal | undefined;
}

export interface ContentStoreWriteOptions extends ContentStoreCallOptions {
  readonly mediaType: string;
}

export interface ArtifactContentStore {
  /**
   * Create-once, as ALF-DEC-029 requires: writing a content identity again with the same bytes
   * succeeds, so an upload retry is harmless; writing it with different bytes is a
   * `content_conflict`, because a stored revision is immutable.
   */
  put(contentId: string, bytes: Buffer, options: ContentStoreWriteOptions): Promise<StoredContent>;

  /** Exact bytes, or `null` when this content identity holds nothing. */
  get(contentId: string, options?: ContentStoreCallOptions): Promise<Buffer | null>;

  exists(contentId: string, options?: ContentStoreCallOptions): Promise<boolean>;

  /** Removing absent content succeeds: garbage collection may repeat. */
  delete(contentId: string, options?: ContentStoreCallOptions): Promise<void>;

  /** Proves the store can be written to; rejects with `storage_unreachable` otherwise. */
  probe(options?: ContentStoreCallOptions): Promise<void>;

  /** Releases sockets and handles at shutdown. */
  close(): Promise<void>;
}

export const ARTIFACT_CONTENT_STORE = Symbol('ARTIFACT_CONTENT_STORE');

export type ContentStoreErrorCode =
  'invalid_identifier' | 'content_conflict' | 'storage_unavailable' | 'storage_unreachable';

export class ContentStoreError extends Error {
  constructor(
    readonly code: ContentStoreErrorCode,
    options?: { readonly cause?: unknown },
  ) {
    super('The content store request could not be completed.', options);
    this.name = 'ContentStoreError';
  }
}

const CONTENT_ID = /^[0-9a-z][0-9a-z-]{1,62}[0-9a-z]$/u;

/**
 * A stored object's path. Content identities are opaque, so neither a file name nor any other
 * user-authored text reaches a key, and ALF-DEC-055 keeps tenant and project identifiers out of
 * physical keys. The first two characters fan the objects out so that a directory of the on-disk
 * store does not hold every file; they are uniform because identities are random UUIDs.
 *
 * Identities are server-derived, but they are still checked here: a key is the one place where a
 * crafted identifier could escape its directory or its bucket prefix.
 */
export function contentObjectKey(contentId: string): string {
  if (!CONTENT_ID.test(contentId)) throw new ContentStoreError('invalid_identifier');
  return `contents/${contentId.slice(0, 2)}/${contentId}`;
}
