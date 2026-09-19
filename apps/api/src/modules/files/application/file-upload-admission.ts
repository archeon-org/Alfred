import { IsNull, type EntityManager } from 'typeorm';

import { ApiException } from '../../../common/errors/api.exception';
import type { OwnerScope } from '../../../common/ownership/owner-scope';
import type { InspectedFile } from '../domain/file-inspection';
import { ArtifactContentEntity } from '../infrastructure/persistence/artifact-content.entity';
import { ArtifactFolderEntity } from '../infrastructure/persistence/artifact-folder.entity';
import { ArtifactRevisionEntity } from '../infrastructure/persistence/artifact-revision.entity';
import { ArtifactEntity } from '../infrastructure/persistence/artifact.entity';
import { lockOwner, readQuota } from './file-quota';
import type { FileSettings } from './file-settings';

export interface UploadInput {
  readonly bytes: Buffer;
  readonly declaredName: string;
  readonly uploadId: string;
  readonly folderId: string | null;
}

export interface Admission {
  readonly contentId: string;
  /** The reservation deadline this request wrote; what fences its own `abandon`. */
  readonly deadline?: Date;
  /** Set when the library already answers this request: a replay or the same bytes. */
  readonly existing?: { readonly artifact: ArtifactEntity; readonly deduplicated: boolean };
}

export interface AdmissionOptions {
  readonly settings: FileSettings;
  readonly backend: 'local' | 's3';
}

/**
 * The first transaction of an upload, under the owner lock: what the library already answers (a
 * replayed identity, the same bytes), then the folder, the quota and the reservation row that
 * holds the quota while the bytes are written.
 */
export async function admitUpload(
  manager: EntityManager,
  scope: OwnerScope,
  input: UploadInput,
  inspected: InspectedFile,
  sha256: string,
  options: AdmissionOptions,
): Promise<Admission> {
  await lockOwner(manager, scope);
  const contents = manager.getRepository(ArtifactContentEntity);

  // Locked, because the collector may be removing this very row: once it commits, the row is
  // simply not found and the request goes on as a first upload. Read without the lock, a row
  // deleted a moment later would leave the bytes written next without any record.
  const replayed = await contents.findOne({
    where: { ...scope, uploadId: input.uploadId },
    lock: { mode: 'pessimistic_write' },
  });
  if (replayed !== null) {
    if (replayed.sha256 !== sha256) {
      throw new ApiException(
        409,
        'file_upload_conflict',
        'This upload identity was already used for another file.',
      );
    }
    const artifact = await artifactOfContent(manager, replayed.id);
    if (artifact !== null)
      return { contentId: replayed.id, existing: { artifact, deduplicated: false } };
    if (replayed.state !== 'pending' && replayed.state !== 'failed') {
      // The first attempt found these bytes already in the library and answered that file; a
      // replay whose answer was lost gets the same one.
      const same = await artifactWithDigest(manager, scope, sha256);
      if (same !== null) {
        return { contentId: replayed.id, existing: { artifact: same, deduplicated: true } };
      }
      // The file this identity created was deleted since: the identity is spent.
      throw new ApiException(
        409,
        'file_upload_conflict',
        'This upload identity was already used for another file.',
      );
    }
    // The first attempt stopped between its two transactions: finish it under the same identity.
    // A reservation that failed or expired no longer counts, so it is admitted again.
    const reserved =
      replayed.state === 'pending' &&
      replayed.expiresAt !== null &&
      replayed.expiresAt.getTime() > Date.now();
    if (!reserved) await assertQuota(manager, scope, input.bytes.byteLength, options.settings);
    const deadline = reservationDeadline(options.settings);
    await contents.update({ id: replayed.id }, { state: 'pending', expiresAt: deadline });
    return { contentId: replayed.id, deadline };
  }

  const same = await artifactWithDigest(manager, scope, sha256);
  if (same !== null) return { contentId: '', existing: { artifact: same, deduplicated: true } };

  if (input.folderId !== null) await assertFolder(manager, scope, input.folderId);
  await assertQuota(manager, scope, input.bytes.byteLength, options.settings);

  const deadline = reservationDeadline(options.settings);
  const content = await contents.save(
    contents.create({
      ...scope,
      role: 'original',
      backend: options.backend,
      mediaType: inspected.mediaType,
      sizeBytes: input.bytes.byteLength,
      sha256,
      state: 'pending',
      uploadId: input.uploadId,
      expiresAt: deadline,
      purgedAt: null,
    }),
  );
  return { contentId: content.id, deadline };
}

async function assertQuota(
  manager: EntityManager,
  scope: OwnerScope,
  incomingBytes: number,
  settings: FileSettings,
): Promise<void> {
  const quota = await readQuota(manager, scope, settings);
  if (quota.usedBytes + quota.reservedBytes + incomingBytes > quota.limitBytes) {
    throw new ApiException(409, 'quota_exceeded', 'The file storage quota is reached.', {
      usedBytes: quota.usedBytes,
      reservedBytes: quota.reservedBytes,
      limitBytes: quota.limitBytes,
    });
  }
}

function reservationDeadline(settings: FileSettings): Date {
  return new Date(Date.now() + settings.pendingUploadTtlMs);
}

export function artifactWithDigest(
  manager: EntityManager,
  scope: OwnerScope,
  sha256: string,
): Promise<ArtifactEntity | null> {
  return manager
    .getRepository(ArtifactEntity)
    .findOne({ where: { ...scope, sha256, deletedAt: IsNull() } });
}

export async function artifactOfContent(
  manager: EntityManager,
  contentId: string,
): Promise<ArtifactEntity | null> {
  const revision = await manager
    .getRepository(ArtifactRevisionEntity)
    .findOne({ where: { contentId } });
  if (revision === null) return null;
  return manager
    .getRepository(ArtifactEntity)
    .findOne({ where: { id: revision.artifactId, deletedAt: IsNull() } });
}

async function assertFolder(
  manager: EntityManager,
  scope: OwnerScope,
  folderId: string,
): Promise<void> {
  const exists = await manager
    .getRepository(ArtifactFolderEntity)
    .existsBy({ id: folderId, ...scope });
  if (!exists) throw new ApiException(404, 'folder_not_found', 'Folder not found.');
}
