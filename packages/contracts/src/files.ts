import { z } from 'zod/mini';

import { successEnvelopeSchema } from './envelope';
import { listEnvelopeSchema } from './pagination';

/** Owner steering, workshop Revision 86: configurable starting limits, enforced by the API. */
export const FILE_MAX_BYTES = 5 * 1024 * 1024;
export const FILE_QUOTA_BYTES_PER_USER = 25 * 1024 * 1024;
/**
 * The largest per-file limit a deployment may configure. The web proxy is sized from it, so that
 * any limit the API accepts is reachable from the application and refused with the API's typed
 * error rather than with the proxy's own page.
 */
export const FILE_MAX_BYTES_CEILING = 25 * 1024 * 1024;
/**
 * Uploads one account sends at once. The application queues beyond it, and the API refuses beyond
 * it, so that one account cannot hold every upload slot of an instance.
 */
export const FILE_MAX_CONCURRENT_UPLOADS_PER_USER = 2;

export const FILE_NAME_MAX_LENGTH = 255;
export const FILE_DESCRIPTION_MAX_LENGTH = 1_024;
export const FILE_TAG_MAX_LENGTH = 40;
export const FILE_MAX_TAGS = 16;
export const FILE_SEARCH_MAX_LENGTH = 100;
export const FOLDER_NAME_MAX_LENGTH = 120;
export const FOLDER_MAX_DEPTH = 8;
export const FOLDER_MAX_COUNT = 500;

/** What one chat message may carry (ALF-DEC-010 bounds the text the model then receives). */
export const FILE_MAX_ATTACHMENTS_PER_MESSAGE = 8;
export const FILE_MAX_IMAGES_PER_MESSAGE = 4;

/** Accepted by extension in the file picker; the API decides from the bytes, never the name. */
export const FILE_ACCEPTED_EXTENSIONS = Object.freeze([
  '.pdf',
  '.docx',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
] as const);

export const FILE_MEDIA_TYPES = Object.freeze({
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
} as const);

export const fileKindSchema = z.enum(['pdf', 'docx', 'image']);
export type FileKind = z.infer<typeof fileKindSchema>;

/**
 * Whether the agent can use the file yet. A document is `processing` while its text is extracted
 * and an image while its model-facing copy is prepared; `failed` carries a reason the user can act on.
 */
export const fileReadinessSchema = z.enum(['processing', 'ready', 'failed']);
export type FileReadiness = z.infer<typeof fileReadinessSchema>;

export const fileFailureCodeSchema = z.enum([
  'no_readable_text',
  'parser_error',
  'timeout',
  'too_large',
  'unsupported',
]);
export type FileFailureCode = z.infer<typeof fileFailureCodeSchema>;

const isoDateTime = z.iso.datetime({ offset: true });
const fileName = z.string().check(z.minLength(1), z.maxLength(FILE_NAME_MAX_LENGTH));
const folderName = z.string().check(z.minLength(1), z.maxLength(FOLDER_NAME_MAX_LENGTH));
const tags = z
  .array(z.string().check(z.minLength(1), z.maxLength(FILE_TAG_MAX_LENGTH)))
  .check(z.maxLength(FILE_MAX_TAGS));

/** A file of the user's personal library (ALF-DEC-013 `/user`); storage details never appear. */
export const storedFileSchema = z.readonly(
  z.object({
    id: z.uuid(),
    name: fileName,
    kind: fileKindSchema,
    mediaType: z.string().check(z.minLength(1), z.maxLength(127)),
    sizeBytes: z.number().check(z.int(), z.minimum(1)),
    readiness: fileReadinessSchema,
    failureCode: z.nullable(fileFailureCodeSchema),
    folderId: z.nullable(z.uuid()),
    tags: z.readonly(tags),
    description: z.nullable(z.string().check(z.maxLength(FILE_DESCRIPTION_MAX_LENGTH))),
    /** Pages of a PDF once read; null for other kinds or before extraction. */
    pageCount: z.nullable(z.number().check(z.int(), z.minimum(0))),
    /** Where the file was sent: shown before a deletion and used by the "attached" filter. */
    usage: z.readonly(
      z.object({
        conversations: z.number().check(z.int(), z.minimum(0)),
        messages: z.number().check(z.int(), z.minimum(0)),
      }),
    ),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  }),
);
export type StoredFile = z.infer<typeof storedFileSchema>;

export const fileEnvelopeSchema = successEnvelopeSchema(storedFileSchema);
export const fileListEnvelopeSchema = listEnvelopeSchema(storedFileSchema);
export interface FilePage {
  readonly items: readonly StoredFile[];
  readonly nextCursor: string | null;
}

/** `deduplicated` tells the browser the bytes were already in the library: nothing was charged. */
export const fileUploadEnvelopeSchema = successEnvelopeSchema(
  z.readonly(z.object({ file: storedFileSchema, deduplicated: z.boolean() })),
);
export type FileUploadResult = z.infer<typeof fileUploadEnvelopeSchema>['data'];

/** `folderId=root` lists the top level; omitted, the whole library is listed, newest first. */
export const FILE_ROOT_FOLDER = 'root';
export const fileListFiltersSchema = z.object({
  search: z.optional(z.string().check(z.maxLength(FILE_SEARCH_MAX_LENGTH))),
  kind: z.optional(fileKindSchema),
  readiness: z.optional(fileReadinessSchema),
  folderId: z.optional(z.union([z.literal(FILE_ROOT_FOLDER), z.uuid()])),
  /** Only files sent in this conversation. */
  conversationId: z.optional(z.uuid()),
  tag: z.optional(z.string().check(z.minLength(1), z.maxLength(FILE_TAG_MAX_LENGTH))),
});
export type FileListFilters = z.infer<typeof fileListFiltersSchema>;

export const updateFileInputSchema = z.object({
  name: z.optional(fileName),
  /** `null` moves the file to the top level. */
  folderId: z.optional(z.nullable(z.uuid())),
  tags: z.optional(tags),
  description: z.optional(z.nullable(z.string().check(z.maxLength(FILE_DESCRIPTION_MAX_LENGTH)))),
});
export type UpdateFileInput = z.infer<typeof updateFileInputSchema>;

/** A folder organizes the library; it is metadata and never mirrors a storage path. */
export const fileFolderSchema = z.readonly(
  z.object({
    id: z.uuid(),
    name: folderName,
    parentId: z.nullable(z.uuid()),
    depth: z.number().check(z.int(), z.minimum(1), z.maximum(FOLDER_MAX_DEPTH)),
    fileCount: z.number().check(z.int(), z.minimum(0)),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  }),
);
export type FileFolder = z.infer<typeof fileFolderSchema>;

export const fileFolderEnvelopeSchema = successEnvelopeSchema(fileFolderSchema);
/** The whole tree in one answer: a library holds at most `FOLDER_MAX_COUNT` folders. */
export const fileFolderListEnvelopeSchema = successEnvelopeSchema(
  z.readonly(z.object({ items: z.readonly(z.array(fileFolderSchema)) })),
);

export const createFolderInputSchema = z.object({
  name: folderName,
  parentId: z.optional(z.nullable(z.uuid())),
});
export type CreateFolderInput = z.infer<typeof createFolderInputSchema>;

export const updateFolderInputSchema = z.object({
  name: z.optional(folderName),
  parentId: z.optional(z.nullable(z.uuid())),
});
export type UpdateFolderInput = z.infer<typeof updateFolderInputSchema>;

/** Revision 86: expose used and reserved capacity, and refuse safely. */
export const fileQuotaSchema = z.readonly(
  z.object({
    usedBytes: z.number().check(z.int(), z.minimum(0)),
    reservedBytes: z.number().check(z.int(), z.minimum(0)),
    limitBytes: z.number().check(z.int(), z.minimum(1)),
    maxFileBytes: z.number().check(z.int(), z.minimum(1)),
  }),
);
export type FileQuota = z.infer<typeof fileQuotaSchema>;
export const fileQuotaEnvelopeSchema = successEnvelopeSchema(fileQuotaSchema);

/**
 * A file as one message carried it. The row outlives the file: after a deletion the transcript
 * still names what was sent (`available: false`), as ALF-DEC-028 requires for attachments.
 */
export const messageAttachmentSchema = z.readonly(
  z.object({
    fileId: z.uuid(),
    name: fileName,
    kind: fileKindSchema,
    mediaType: z.string().check(z.minLength(1), z.maxLength(127)),
    sizeBytes: z.number().check(z.int(), z.minimum(1)),
    available: z.boolean(),
    /** What the model actually received; null until the message is dispatched. */
    delivery: z.nullable(z.enum(['text', 'image', 'unavailable'])),
    truncated: z.boolean(),
  }),
);
export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;

const IMAGE_SIGNATURES: readonly (readonly [string, readonly number[]])[] = [
  [FILE_MEDIA_TYPES.png, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  [FILE_MEDIA_TYPES.jpeg, [0xff, 0xd8, 0xff]],
  [FILE_MEDIA_TYPES.gif, [0x47, 0x49, 0x46, 0x38]],
];

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  signature.every((value, index) => bytes[offset + index] === value);

export interface SniffedFile {
  readonly kind: FileKind;
  readonly mediaType: string;
}

/**
 * The type a file's leading bytes declare, shared by the browser's early refusal and the API's
 * authoritative check. A ZIP container is only a DOCX *candidate*: the API inspects its entries.
 * Returns `null` for anything outside the allow-list, whatever the file name says.
 */
export function sniffFileType(bytes: Uint8Array): SniffedFile | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { kind: 'pdf', mediaType: FILE_MEDIA_TYPES.pdf };
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return { kind: 'docx', mediaType: FILE_MEDIA_TYPES.docx };
  }
  for (const [mediaType, signature] of IMAGE_SIGNATURES) {
    if (startsWith(bytes, signature)) return { kind: 'image', mediaType };
  }
  // RIFF....WEBP
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { kind: 'image', mediaType: FILE_MEDIA_TYPES.webp };
  }
  return null;
}

/** How many leading bytes `sniffFileType` needs. */
export const FILE_SIGNATURE_BYTES = 12;
