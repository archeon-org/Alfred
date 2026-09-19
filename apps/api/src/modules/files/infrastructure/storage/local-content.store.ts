import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, link, mkdir, open, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { sha256Of } from '../../domain/content-digest';
import {
  type ArtifactContentStore,
  contentObjectKey,
  ContentStoreError,
  type StoredContent,
} from '../../domain/content-store.port';

/**
 * The development profile of ALF-DEC-054's content store: the same key layout as the bucket, on a
 * directory of this machine. `validateFileStorageEnvironment` refuses it in production, because a
 * container's own disk is never a durable location.
 */
export class LocalContentStore implements ArtifactContentStore {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  // The media type is the product's metadata, held in PostgreSQL; a file on disk carries none.
  async put(contentId: string, bytes: Buffer): Promise<StoredContent> {
    const path = this.pathFor(contentId);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });

    // Write beside the target, flush, then publish under the final name only if it is free: a
    // crash never leaves half a file there, and an existing identity is never replaced.
    const staging = `${path}.${randomUUID()}.part`;
    try {
      const handle = await open(staging, 'wx', 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.publish(staging, path);
    } catch (error) {
      if (!isErrorCode(error, 'EEXIST')) throw error;
      const existing = await readFile(path);
      if (!existing.equals(bytes)) throw new ContentStoreError('content_conflict');
    } finally {
      await rm(staging, { force: true }).catch(() => undefined);
    }

    return { byteSize: bytes.byteLength, sha256: sha256Of(bytes) };
  }

  async get(contentId: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(contentId));
    } catch (error) {
      if (isErrorCode(error, 'ENOENT')) return null;
      throw error;
    }
  }

  async exists(contentId: string): Promise<boolean> {
    try {
      return (await stat(this.pathFor(contentId))).isFile();
    } catch (error) {
      if (isErrorCode(error, 'ENOENT')) return false;
      throw error;
    }
  }

  async delete(contentId: string): Promise<void> {
    await rm(this.pathFor(contentId), { force: true });
  }

  /** A read-only or missing directory is found when the API starts, not by the first upload. */
  async probe(): Promise<void> {
    const probe = join(this.root, `.probe-${randomUUID()}`);
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const handle = await open(probe, 'wx', 0o600);
      await handle.close();
      await rm(probe, { force: true });
    } catch (error) {
      throw new ContentStoreError('storage_unreachable', { cause: error });
    }
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  /** A hard link fails when the name is taken; a filesystem without links gets an exclusive copy. */
  private async publish(staging: string, path: string): Promise<void> {
    try {
      await link(staging, path);
    } catch (error) {
      if (isErrorCode(error, 'EEXIST')) throw error;
      await copyFile(staging, path, constants.COPYFILE_EXCL);
    }
  }

  private pathFor(contentId: string): string {
    const path = resolve(join(this.root, contentObjectKey(contentId)));
    // The key builder already refuses a crafted identifier; this is the second, cheap check that
    // nothing ever resolves outside the configured directory.
    if (!path.startsWith(`${this.root}/`)) throw new ContentStoreError('invalid_identifier');
    return path;
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
