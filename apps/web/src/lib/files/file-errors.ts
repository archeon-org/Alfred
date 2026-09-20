import {
  FILE_MAX_ATTACHMENTS_PER_MESSAGE,
  FILE_MAX_BYTES,
  FILE_MAX_IMAGES_PER_MESSAGE,
  FILE_NAME_MAX_LENGTH,
  FILE_QUOTA_BYTES_PER_USER,
  FOLDER_MAX_COUNT,
  FOLDER_MAX_DEPTH,
} from '@alfred/contracts';

import { formatFileSize } from '@/lib/files/file-format';
import type { FileRejection } from '@/lib/files/file-kinds';
import { ApiRequestError } from '@/services/http/api-json';

const UNSUPPORTED =
  'Format non pris en charge. Importez un PDF, un DOCX ou une image (PNG, JPEG, WebP, GIF).';
export const UPLOAD_NETWORK_ERROR =
  'Impossible d’envoyer le fichier. Vérifiez la connexion et réessayez.';

const tooLarge = (maxBytes: number) => `Ce fichier dépasse ${formatFileSize(maxBytes)}.`;

/** What one message may carry, stated the same way by the composer and by the API refusal. */
export const ATTACHMENT_LIMIT_MESSAGE = `Un message porte au plus ${FILE_MAX_ATTACHMENTS_PER_MESSAGE} fichiers, dont ${FILE_MAX_IMAGES_PER_MESSAGE} images.`;

/** Refusals of `POST …/executions` about its files; the chat's own error copy reuses them. */
export const ATTACHMENT_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  attachment_not_found: 'Un fichier joint n’existe plus. Retirez-le, puis renvoyez le message.',
  attachment_not_ready: 'Un fichier est encore en cours d’analyse.',
  attachment_limit_reached: ATTACHMENT_LIMIT_MESSAGE,
});

const MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  ...ATTACHMENT_ERROR_MESSAGES,
  HTTP_401: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  HTTP_429: 'Trop de requêtes. Réessayez dans un instant.',
  unsupported_media_type: UNSUPPORTED,
  file_rejected:
    'Ce fichier a été refusé : son contenu n’est pas un PDF, un DOCX ou une image valide.',
  file_upload_conflict: 'Cet envoi est déjà en cours. Réessayez dans un instant.',
  upload_busy: 'Trop d’envois sont en cours. Réessayez dans un instant.',
  storage_unavailable: 'Le stockage est indisponible. Réessayez plus tard.',
  file_not_found: 'Ce fichier n’est plus disponible.',
  file_name_conflict: 'Un fichier porte déjà ce nom dans ce dossier.',
  file_in_use: 'Une réponse en cours utilise ce fichier. Réessayez une fois la réponse terminée.',
  file_content_purged: 'Le contenu de ce fichier n’est plus conservé.',
  folder_not_found: 'Ce dossier n’existe plus.',
  folder_name_conflict: 'Un dossier porte déjà ce nom à cet emplacement.',
  folder_not_empty: 'Ce dossier n’est pas vide. Déplacez ou supprimez d’abord son contenu.',
  folder_depth_exceeded: `Les dossiers s’imbriquent sur ${FOLDER_MAX_DEPTH} niveaux au plus.`,
  folder_cycle: 'Un dossier ne peut pas être déplacé dans lui-même.',
  folder_limit_reached: `Vous avez atteint la limite de ${FOLDER_MAX_COUNT} dossiers.`,
});

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** French copy for a failed file request; `fallback` names the action that failed. */
export function fileError(reason: unknown, fallback: string = UPLOAD_NETWORK_ERROR): string {
  if (!(reason instanceof ApiRequestError)) return fallback;
  if (reason.code === 'quota_exceeded') {
    // The budget is configurable on the API: the refusal states the one that applied.
    const limit = positiveNumber(reason.details?.limitBytes) ?? FILE_QUOTA_BYTES_PER_USER;
    return `Votre espace de fichiers est plein (${formatFileSize(limit)}). Supprimez des fichiers pour continuer.`;
  }
  if (reason.code === 'file_too_large' || reason.status === 413)
    return tooLarge(positiveNumber(reason.details?.maxFileBytes) ?? FILE_MAX_BYTES);
  if (reason.status === 415) return UNSUPPORTED;
  const known = MESSAGES[reason.code];
  if (known !== undefined) return known;
  if (reason.status === 400) return 'Les informations saisies sont invalides.';
  return fallback;
}

/**
 * Whether sending the same bytes again can succeed. A refusal about the content itself is final;
 * a full quota can be retried once files were deleted, and the `uploadId` stays the same.
 */
export function isRetryableUpload(reason: unknown): boolean {
  if (!(reason instanceof ApiRequestError)) return true;
  if (reason.status === 413 || reason.status === 415 || reason.status === 400) return false;
  return !['file_too_large', 'unsupported_media_type', 'file_rejected'].includes(reason.code);
}

/** Copy for a file the browser refuses before any request. */
export function fileRejectionMessage(
  reason: FileRejection,
  maxBytes: number = FILE_MAX_BYTES,
): string {
  if (reason === 'empty') return 'Ce fichier est vide.';
  if (reason === 'too_large') return tooLarge(maxBytes);
  if (reason === 'name_too_long')
    return `Le nom de ce fichier dépasse ${FILE_NAME_MAX_LENGTH} caractères.`;
  if (reason === 'unreadable') return 'Impossible de lire ce fichier sur cet appareil.';
  return UNSUPPORTED;
}
