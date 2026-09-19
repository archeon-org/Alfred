import { API_ERROR_CODES } from '@alfred/contracts';
import { describe, expect, it } from 'vitest';

import {
  ATTACHMENT_ERROR_MESSAGES,
  fileError,
  fileRejectionMessage,
  isRetryableUpload,
  UPLOAD_NETWORK_ERROR,
} from '@/lib/files/file-errors';
import { describeApiError } from '@/lib/workspace/api-error-message';
import { ApiRequestError } from '@/services/http/api-json';

const api = (status: number, code: string, details?: Record<string, unknown>) =>
  new ApiRequestError(status, code, 'Internal server wording', details);

describe('file error copy', () => {
  it.each([
    [413, 'file_too_large', 'Ce fichier dépasse 5 Mio.'],
    [
      415,
      'unsupported_media_type',
      'Format non pris en charge. Importez un PDF, un DOCX ou une image (PNG, JPEG, WebP, GIF).',
    ],
    [
      409,
      'quota_exceeded',
      'Votre espace de fichiers est plein (25 Mio). Supprimez des fichiers pour continuer.',
    ],
    [503, 'storage_unavailable', 'Le stockage est indisponible. Réessayez plus tard.'],
    [404, 'file_not_found', 'Ce fichier n’est plus disponible.'],
    [409, 'attachment_not_ready', 'Un fichier est encore en cours d’analyse.'],
  ])('maps %d %s to its wording', (status, code, message) => {
    expect(fileError(api(status, code))).toBe(message);
  });

  const fileCodes = API_ERROR_CODES.filter(
    (code) =>
      code.startsWith('file_') ||
      code.startsWith('folder_') ||
      code.startsWith('attachment_') ||
      ['unsupported_media_type', 'quota_exceeded', 'storage_unavailable'].includes(code),
  );

  it.each(fileCodes)('has French copy for %s that never leaks the server message', (code) => {
    const message = fileError(api(409, code), 'FALLBACK');
    expect(message).not.toBe('FALLBACK');
    expect(message).not.toContain('Internal');
    expect(message).toMatch(/[.…]$/u);
  });

  it('covers every file, folder and attachment code of the contract', () => {
    expect(fileCodes.length).toBeGreaterThanOrEqual(18);
  });

  it('states the budget the API applied when the refusal carries it', () => {
    expect(fileError(api(409, 'quota_exceeded', { limitBytes: 50 * 1024 * 1024 }))).toContain(
      '(50 Mio)',
    );
    expect(fileError(api(409, 'quota_exceeded', { limitBytes: 'beaucoup' }))).toContain('(25 Mio)');
  });

  it('reads a bare 413 or 415 without a business code', () => {
    expect(fileError(api(413, 'HTTP_413'))).toBe('Ce fichier dépasse 5 Mio.');
    expect(fileError(api(415, 'HTTP_415'))).toMatch(/^Format non pris en charge/u);
  });

  it('falls back to the network wording, or to the one the caller names', () => {
    expect(fileError(new TypeError('Failed to fetch'))).toBe(UPLOAD_NETWORK_ERROR);
    expect(UPLOAD_NETWORK_ERROR).toBe(
      'Impossible d’envoyer le fichier. Vérifiez la connexion et réessayez.',
    );
    expect(fileError(api(500, 'HTTP_500'), 'Impossible de renommer ce fichier.')).toBe(
      'Impossible de renommer ce fichier.',
    );
    expect(fileError(api(400, 'HTTP_400'))).toBe('Les informations saisies sont invalides.');
  });

  it('retries what may succeed later, never a refusal of the content itself', () => {
    expect(isRetryableUpload(new TypeError('offline'))).toBe(true);
    expect(isRetryableUpload(api(503, 'storage_unavailable'))).toBe(true);
    expect(isRetryableUpload(api(409, 'quota_exceeded'))).toBe(true);
    expect(isRetryableUpload(api(413, 'file_too_large'))).toBe(false);
    expect(isRetryableUpload(api(415, 'unsupported_media_type'))).toBe(false);
    expect(isRetryableUpload(api(422, 'file_rejected'))).toBe(false);
  });

  it('explains each early refusal', () => {
    expect(fileRejectionMessage('empty')).toBe('Ce fichier est vide.');
    expect(fileRejectionMessage('too_large')).toBe('Ce fichier dépasse 5 Mio.');
    expect(fileRejectionMessage('too_large', 1024 * 1024)).toBe('Ce fichier dépasse 1 Mio.');
    expect(fileRejectionMessage('name_too_long')).toContain('255');
    expect(fileRejectionMessage('unreadable')).toContain('Impossible de lire');
    expect(fileRejectionMessage('unsupported_extension')).toBe(
      fileRejectionMessage('unsupported_content'),
    );
  });

  it('gives a refused send the same wording as the file screens', () => {
    for (const [code, message] of Object.entries(ATTACHMENT_ERROR_MESSAGES))
      expect(describeApiError(api(409, code), 'L’envoi du message a échoué.')).toBe(message);
  });
});
