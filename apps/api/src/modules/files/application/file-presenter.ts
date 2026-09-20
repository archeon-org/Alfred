import type { FileFolder, StoredFile } from '@alfred/contracts';
import type { EntityManager } from 'typeorm';

import type { ArtifactFolderEntity } from '../infrastructure/persistence/artifact-folder.entity';
import type { ArtifactEntity } from '../infrastructure/persistence/artifact.entity';

export interface FileUsage {
  readonly conversations: number;
  readonly messages: number;
}

const NO_USAGE: FileUsage = Object.freeze({ conversations: 0, messages: 0 });

/** The public shape of a library file: no content identity, digest, backend or storage key. */
export function toStoredFile(artifact: ArtifactEntity, usage: FileUsage = NO_USAGE): StoredFile {
  return {
    id: artifact.id,
    name: artifact.name,
    kind: artifact.kind,
    mediaType: artifact.mediaType,
    sizeBytes: artifact.sizeBytes,
    readiness: artifact.readiness,
    failureCode: artifact.failureCode,
    folderId: artifact.folderId,
    tags: artifact.tags,
    description: artifact.description,
    pageCount: artifact.pageCount,
    usage,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

export function toFileFolder(folder: ArtifactFolderEntity, fileCount: number): FileFolder {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    depth: folder.depth,
    fileCount,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}

/** In how many messages and conversations each file was sent, in one grouped query. */
export async function loadUsage(
  manager: EntityManager,
  artifactIds: readonly string[],
): Promise<ReadonlyMap<string, FileUsage>> {
  if (artifactIds.length === 0) return new Map();
  const rows: { artifact_id: string; messages: string; conversations: string }[] =
    await manager.query(
      `SELECT a."artifact_id", count(*) AS messages, count(DISTINCT m."conversation_id") AS conversations
       FROM "api_message_attachments" a JOIN "api_messages" m ON m."id" = a."message_id"
       WHERE a."artifact_id" = ANY($1::uuid[]) GROUP BY a."artifact_id"`,
      [artifactIds],
    );
  return new Map(
    rows.map((row) => [
      row.artifact_id,
      { conversations: Number(row.conversations), messages: Number(row.messages) },
    ]),
  );
}
