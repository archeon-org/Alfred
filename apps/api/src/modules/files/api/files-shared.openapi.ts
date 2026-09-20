import {
  FILE_DESCRIPTION_MAX_LENGTH,
  FILE_MAX_ATTACHMENTS_PER_MESSAGE,
  FILE_MAX_IMAGES_PER_MESSAGE,
  FILE_MAX_TAGS,
  FILE_MEDIA_TYPES,
  FILE_TAG_MAX_LENGTH,
} from '@alfred/contracts';
import { ApiIdParam, type ApiProblem } from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';

/** What the three `files*.openapi.ts` files share: identifiers, field texts, examples, errors. */
export const FILES_PDF_ID = 'c1f6a2d4-7b3e-4a58-9d10-5e8f2b6c4a97';
export const FILES_IMAGE_ID = '4e9b7d21-0c5a-4f83-b6e2-a1d3c8f05b79';
export const FILES_SCAN_ID = '8a2d5f60-3e1b-4c97-a4d8-6f0b9e7c2d15';
/** The `Contrats` folder of the folder routes' examples. */
export const FILES_FOLDER_ID = '6d1f0a52-3b7e-4c19-8a44-9e2b5c7d1f03';

export const FILES_NAME_CLEANING =
  'normalised to Unicode NFC, control characters (line breaks included) and invisible direction or zero-width marks removed, `/`, `\\` and `:` replaced by `-`, runs of white space replaced by one space, then trimmed';

export const FILES_ATTACH_RULE = `Only a \`ready\` file can be attached to a message: send its \`id\` in \`attachmentIds\` of \`POST /api/conversations/{id}/executions\` (at most ${FILE_MAX_ATTACHMENTS_PER_MESSAGE} files per message, of which at most ${FILE_MAX_IMAGES_PER_MESSAGE} images).`;

/** Descriptions of a library file, for any path it appears under (`data.`, `data.items[].`, `data.file.`). */
export const filesStoredFileFields = (prefix: string): Record<string, string> => ({
  [`${prefix}id`]:
    'Identifier of the file. Use it in the `/api/files/{id}` routes and in `attachmentIds` when sending a message.',
  [`${prefix}name`]:
    'Display name, unique within its folder without regard to case. Cleaned by the API; its extension is the one of the detected type (`.pdf`, `.docx`, `.png`, `.jpg`, `.webp`, `.gif`), whatever was sent.',
  [`${prefix}kind`]:
    '`pdf`, `docx` or `image`. Decided from the bytes at upload, never from the name or the declared type.',
  [`${prefix}mediaType`]: `Media type detected from the bytes, one of \`${Object.values(FILE_MEDIA_TYPES).join('`, `')}\`. It is the \`Content-Type\` of \`GET /api/files/{id}/content\`.`,
  [`${prefix}sizeBytes`]:
    'Size of the original file in bytes: what the file charges against the quota.',
  [`${prefix}readiness`]:
    '`processing` right after the upload, while the text of a document is extracted or the reduced copy of an image is prepared (off the request path: re-read the file to follow it); then `ready`, or `failed` with a `failureCode`. Only a `ready` file can be attached to a message. A `processing` or `failed` file stays in the library and can be downloaded, renamed and deleted.',
  [`${prefix}failureCode`]:
    'Why processing failed; `null` unless `readiness` is `failed`. `no_readable_text`: the document holds no text (a scanned PDF has pages but no text layer, and there is no OCR); `parser_error`: the file could not be read; `timeout`: reading it took longer than this deployment allows; `too_large`: reading it needed more memory than allowed. `unsupported` belongs to the contract but is not reported on a library file today.',
  [`${prefix}folderId`]:
    'Folder the file is placed in (see `GET /api/files/folders`); `null` at the top level.',
  [`${prefix}tags`]: `Free labels in the order they were saved, at most ${FILE_MAX_TAGS} of 1 to ${FILE_TAG_MAX_LENGTH} characters, without duplicates. The \`tag\` filter of the list matches one exactly.`,
  [`${prefix}description`]: `Free text of at most ${FILE_DESCRIPTION_MAX_LENGTH} characters; \`null\` when there is none. Searched by the \`search\` filter of the list.`,
  [`${prefix}pageCount`]:
    'Number of pages of a PDF, known once its text was read; `null` for a DOCX or an image, while `processing`, and after a failure.',
  [`${prefix}usage`]:
    'Where the file was sent as a message attachment. Worth showing before a deletion: those messages will keep the name of the file, no longer its content.',
  [`${prefix}usage.conversations`]: 'Number of distinct conversations the file was sent in.',
  [`${prefix}usage.messages`]: 'Number of messages that carried the file.',
  [`${prefix}createdAt`]: 'When the file was uploaded (UTC). The list is ordered on it.',
  [`${prefix}updatedAt`]:
    'Last change of the entry (UTC): a rename, a move, new tags or description, or the end of processing.',
});

/** A contract read and used: processed, filed, tagged, sent twice in one conversation. */
export const filesReadyPdf = {
  id: FILES_PDF_ID,
  name: 'Contrat cadre.pdf',
  kind: 'pdf',
  mediaType: FILE_MEDIA_TYPES.pdf,
  sizeBytes: 482_113,
  readiness: 'ready',
  failureCode: null,
  folderId: FILES_FOLDER_ID,
  tags: ['juridique', '2026'],
  description: 'Version signée',
  pageCount: 12,
  usage: { conversations: 1, messages: 2 },
  createdAt: '2026-09-18T09:20:11.482Z',
  updatedAt: '2026-09-19T14:02:37.150Z',
};

/** The same file as the upload answers it: nothing but what the bytes and the form said. */
export const filesJustUploadedPdf = {
  ...filesReadyPdf,
  readiness: 'processing',
  folderId: null,
  tags: [],
  description: null,
  pageCount: null,
  usage: { conversations: 0, messages: 0 },
  updatedAt: '2026-09-18T09:20:11.482Z',
};

export const filesReadyImage = {
  id: FILES_IMAGE_ID,
  name: 'Schéma réseau.png',
  kind: 'image',
  mediaType: FILE_MEDIA_TYPES.png,
  sizeBytes: 218_734,
  readiness: 'ready',
  failureCode: null,
  folderId: null,
  tags: [],
  description: null,
  pageCount: null,
  usage: { conversations: 0, messages: 0 },
  createdAt: '2026-09-19T16:41:05.033Z',
  updatedAt: '2026-09-19T16:41:06.218Z',
};

/** A scanned document: stored and downloadable, but it cannot be attached. */
export const filesFailedScan = {
  id: FILES_SCAN_ID,
  name: 'scan.pdf',
  kind: 'pdf',
  mediaType: FILE_MEDIA_TYPES.pdf,
  sizeBytes: 1_204_551,
  readiness: 'failed',
  failureCode: 'no_readable_text',
  folderId: null,
  tags: [],
  description: null,
  pageCount: null,
  usage: { conversations: 0, messages: 0 },
  createdAt: '2026-09-17T08:03:52.700Z',
  updatedAt: '2026-09-17T08:03:55.264Z',
};

export const FilesIdParam = () =>
  ApiIdParam(
    'id',
    'Identifier of a file of the signed-in account, as answered by the upload or the list.',
    FILES_PDF_ID,
  );

export const FILES_NOT_FOUND: ApiProblem = {
  ...PROBLEM.notFound('file'),
  when: 'The file does not exist, was deleted, belongs to another account, or the identifier is not a UUID. The cases are indistinguishable by design.',
};

export const FILES_FOLDER_NOT_FOUND: ApiProblem = {
  ...PROBLEM.notFound('folder'),
  when: '`folderId` names a folder that does not exist or belongs to another account; the two cases are indistinguishable by design. Re-read `GET /api/files/folders`.',
};

/** Every route of the library is private and belongs to the `fileUploads` capability. */
export const FILES_ACCESS_PROBLEMS: readonly ApiProblem[] = [
  PROBLEM.unauthenticated,
  PROBLEM.invalidToken,
  PROBLEM.featureDisabled('fileUploads'),
];
