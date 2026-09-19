import {
  FILE_MAX_ATTACHMENTS_PER_MESSAGE,
  FILE_MAX_IMAGES_PER_MESSAGE,
  type FileKind,
  type MessageAttachment,
  type StoredFile,
} from '@alfred/contracts';

import { describeFileFailure } from '@/lib/files/file-format';

/** validating → uploading → processing → ready, or failed with a reason the person can act on. */
export type AttachmentStatus = 'validating' | 'uploading' | 'processing' | 'ready' | 'failed';

/** One chip of the composer: a file being sent from the computer, or one picked in the library. */
export interface ComposerAttachment {
  /** Stable key of the chip; the `uploadId` for a file sent from the computer. */
  readonly localId: string;
  readonly name: string;
  /** Unknown until the leading bytes were read. */
  readonly kind: FileKind | null;
  readonly status: AttachmentStatus;
  /** The library file behind the chip, once it exists. */
  readonly fileId: string | null;
  readonly error: string | null;
  /** The upload may be tried again with the same `uploadId`. */
  readonly retryable: boolean;
}

/** What a user turn shows of its files; a stored row adds availability and truncation. */
export type AttachmentView = Pick<MessageAttachment, 'fileId' | 'name' | 'kind'> &
  Partial<Pick<MessageAttachment, 'available' | 'truncated'>>;

/** What the composer needs from the attachment store; absent while `fileUploads` is off. */
export interface ComposerAttachmentsControls {
  readonly items: readonly ComposerAttachment[];
  /** Latest change worth announcing (limit reached, refusal); null when there is none. */
  readonly notice: string | null;
  readonly addFiles: (files: readonly File[]) => void;
  /** Attaches a library file; returns why it was refused, or null. */
  readonly attachStored: (file: StoredFile) => string | null;
  readonly remove: (localId: string) => void;
  readonly retry: (localId: string) => void;
  /** A file left `processing`: the chip follows what the API now says. */
  readonly settle: (file: StoredFile) => void;
  /** The API no longer serves this file: its chip explains it instead of waiting forever. */
  readonly markUnavailable: (fileId: string, error: string) => void;
  /** An accepted send clears exactly the chips it carried. */
  readonly clear: (localIds: readonly string[]) => void;
}

export const STATUS_LABELS: Readonly<Record<AttachmentStatus, string>> = Object.freeze({
  validating: 'Vérification…',
  uploading: 'Envoi…',
  processing: 'Analyse en cours…',
  ready: 'Prêt',
  failed: 'Échec',
});

export function attachmentFromStoredFile(file: StoredFile, localId: string): ComposerAttachment {
  return {
    localId,
    name: file.name,
    kind: file.kind,
    status: file.readiness,
    fileId: file.id,
    error: file.readiness === 'failed' ? describeFileFailure(file.failureCode) : null,
    retryable: false,
  };
}

/** Why one more file of `kind` cannot join these chips, or null when it can. */
export function attachmentLimitReason(
  items: readonly Pick<ComposerAttachment, 'kind'>[],
  kind: FileKind | null,
): string | null {
  if (items.length >= FILE_MAX_ATTACHMENTS_PER_MESSAGE)
    return `Un message porte au plus ${FILE_MAX_ATTACHMENTS_PER_MESSAGE} fichiers.`;
  if (
    kind === 'image' &&
    items.filter((item) => item.kind === 'image').length >= FILE_MAX_IMAGES_PER_MESSAGE
  )
    return `Un message porte au plus ${FILE_MAX_IMAGES_PER_MESSAGE} images.`;
  return null;
}

/** Why sending is held back by the chips, or null when every chip is ready (or none exists). */
export function attachmentsBlockReason(items: readonly ComposerAttachment[]): string | null {
  if (items.some((item) => item.status === 'failed'))
    return 'Retirez ou renvoyez le fichier en échec avant d’envoyer le message.';
  if (items.some((item) => item.status !== 'ready'))
    return 'L’envoi sera possible dès que les fichiers seront prêts.';
  return null;
}

/** The files a send carries, in chip order. Call only once nothing blocks the send. */
export function sendableAttachments(
  items: readonly ComposerAttachment[],
): readonly (AttachmentView & { readonly localId: string })[] {
  return items.flatMap((item) =>
    item.status === 'ready' && item.fileId !== null && item.kind !== null
      ? [{ fileId: item.fileId, kind: item.kind, localId: item.localId, name: item.name }]
      : [],
  );
}

/** Router state handed to a chat: ids only, so no file name enters the browser history. */
export function attachmentIdsFrom(state: unknown): readonly string[] {
  if (typeof state !== 'object' || state === null || !('attachmentIds' in state)) return [];
  const ids = state.attachmentIds;
  return Array.isArray(ids)
    ? ids
        .filter((id): id is string => typeof id === 'string' && id !== '')
        .slice(0, FILE_MAX_ATTACHMENTS_PER_MESSAGE)
    : [];
}
