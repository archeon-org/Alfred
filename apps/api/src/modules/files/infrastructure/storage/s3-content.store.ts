import { createHash } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import type { FileStorageSettings } from '../../../../config/file-storage';
import { sha256Of } from '../../domain/content-digest';
import {
  type ArtifactContentStore,
  contentObjectKey,
  type ContentStoreCallOptions,
  ContentStoreError,
  type ContentStoreWriteOptions,
  type StoredContent,
} from '../../domain/content-store.port';

type S3Settings = Extract<FileStorageSettings, { driver: 's3' }>;

/** Only the part of the SDK client this adapter uses, so a test can stand in for it. */
export interface S3CommandSender {
  send(command: object, options?: { readonly abortSignal?: AbortSignal }): Promise<unknown>;
  destroy?(): void;
}

/**
 * The production profile of ALF-DEC-054's content store. It speaks plain S3 so that any
 * compatible provider serves it — AWS S3, MinIO, Cloudflare R2, IBM COS, Scaleway or OVH — and it
 * uses no provider-specific feature: `PutObject`, `GetObject`, `HeadObject`, `DeleteObject` and
 * `HeadBucket`. A file is capped well below the multipart threshold, so an object is one request.
 *
 * The principal needs `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on the objects, and
 * `s3:ListBucket` on the bucket: without it a provider answers 403 instead of 404 for an absent
 * key, which this adapter raises rather than reading as "absent".
 *
 * Bytes never leave through a provider address: a download is served by the API from this
 * adapter's response, and no pre-signed URL is handed to the browser or to the agent runtime.
 */
export class S3ContentStore implements ArtifactContentStore {
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(
    private readonly client: S3CommandSender,
    settings: Pick<S3Settings, 'bucket' | 'prefix'>,
  ) {
    this.bucket = settings.bucket;
    this.prefix = settings.prefix;
  }

  async put(
    contentId: string,
    bytes: Buffer,
    options: ContentStoreWriteOptions,
  ): Promise<StoredContent> {
    const stored = { byteSize: bytes.byteLength, sha256: sha256Of(bytes) };

    // Create-once without a conditional write, which not every provider implements: an identity
    // is a fresh server-side UUID, so only a retry of the same upload can find it taken.
    const existing = await this.get(contentId, options);
    if (existing !== null) {
      if (existing.equals(bytes)) return stored;
      throw new ContentStoreError('content_conflict');
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(contentId),
        Body: bytes,
        ContentType: options.mediaType,
        ContentLength: bytes.byteLength,
        // The one integrity header every compatible provider verifies on a single-part write.
        ContentMD5: createHash('md5').update(bytes).digest('base64'),
      }),
      { abortSignal: options.signal },
    );
    return stored;
  }

  async get(contentId: string, options?: ContentStoreCallOptions): Promise<Buffer | null> {
    try {
      const response = (await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.keyFor(contentId) }),
        { abortSignal: options?.signal },
      )) as { Body?: { transformToByteArray?: () => Promise<Uint8Array> } };

      // A response without a readable body is a provider fault, never "no content".
      if (response.Body?.transformToByteArray === undefined) {
        throw new ContentStoreError('storage_unreachable');
      }
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async exists(contentId: string, options?: ContentStoreCallOptions): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.keyFor(contentId) }),
        { abortSignal: options?.signal },
      );
      return true;
    } catch (error) {
      if (isMissingObject(error)) return false;
      throw error;
    }
  }

  async delete(contentId: string, options?: ContentStoreCallOptions): Promise<void> {
    // S3 deletes an absent key without complaint, which is what repeated collection needs.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.keyFor(contentId) }),
      { abortSignal: options?.signal },
    );
  }

  /**
   * A wrong bucket, region, credential or missing permission is found when the API starts. A
   * `HeadObject` on a missing bucket is indistinguishable from a missing key, so this check is
   * what keeps a mistyped bucket from reading as "every file is absent".
   */
  async probe(options?: ContentStoreCallOptions): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), {
        abortSignal: options?.signal,
      });
    } catch (error) {
      throw new ContentStoreError('storage_unreachable', { cause: error });
    }
  }

  close(): Promise<void> {
    this.client.destroy?.();
    return Promise.resolve();
  }

  private keyFor(contentId: string): string {
    const key = contentObjectKey(contentId);
    return this.prefix === '' ? key : `${this.prefix}/${key}`;
  }
}

/**
 * The client for a described bucket, configured for portability rather than for AWS alone.
 *
 * - `requestChecksumCalculation: 'WHEN_REQUIRED'`: since v3.729 the SDK otherwise adds a CRC32
 *   checksum header to every upload (and `aws-chunked` framing to streamed ones), which OVH
 *   rejects and other providers have mishandled.
 * - Explicit timeouts: the handler's defaults are unlimited, so a half-open endpoint would hold a
 *   request for ever. `throwOnRequestTimeout` turns the request timeout into an error.
 * - `expectContinueHeader: false`: from 2 MiB the SDK would send `Expect: 100-continue` on a
 *   fresh non-pooled connection, which some corporate proxies stall on; a capped file gains nothing.
 * - Without static keys, the SDK's default chain resolves an IAM role, IRSA or an ECS task role.
 */
export function createS3Client(settings: S3Settings): S3Client {
  return new S3Client({
    region: settings.region,
    ...(settings.endpoint === undefined ? {} : { endpoint: settings.endpoint }),
    ...(settings.credentials === undefined
      ? {}
      : {
          credentials: {
            accessKeyId: settings.credentials.accessKeyId,
            secretAccessKey: settings.credentials.secretAccessKey,
            ...(settings.credentials.sessionToken === undefined
              ? {}
              : { sessionToken: settings.credentials.sessionToken }),
          },
        }),
    forcePathStyle: settings.forcePathStyle,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    expectContinueHeader: false,
    maxAttempts: 3,
    requestHandler: {
      connectionTimeout: 3_000,
      requestTimeout: 30_000,
      socketTimeout: 30_000,
      throwOnRequestTimeout: true,
    },
  });
}

/**
 * `NoSuchKey` for a read and `NotFound` for a bodiless `HEAD`. Nothing else is "absent": a missing
 * bucket (`NoSuchBucket`, also a 404) and a forbidden read (403) are failures, because reading
 * them as absence would let a later collection purge metadata during a storage outage.
 */
const MISSING_OBJECT_NAMES: ReadonlySet<string> = new Set(['NoSuchKey', 'NotFound']);

function isMissingObject(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' && MISSING_OBJECT_NAMES.has(name);
}
