import { FILE_MAX_CONCURRENT_UPLOADS_PER_USER, fileUploadEnvelopeSchema } from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { z } from 'zod/mini';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiRoute,
  type ApiExample,
} from '../../../common/api-docs/api-docs.decorators';
import { checkApiDocsExample } from '../../../common/api-docs/api-docs.registry';
import { contractSchema } from '../../../common/api-docs/contract-schema';
import {
  FILES_ACCESS_PROBLEMS,
  FILES_ATTACH_RULE,
  FILES_FOLDER_ID,
  FILES_FOLDER_NOT_FOUND,
  FILES_NAME_CLEANING,
  filesJustUploadedPdf,
  filesReadyImage,
  filesReadyPdf,
  filesStoredFileFields,
} from './files-shared.openapi';

const UPLOAD_ID = 'f3b0c1d2-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const MULTIPART = 'multipart/form-data';

/**
 * The text fields of the form, as `FileUploadFieldsDto` validates them: no web contract exists
 * for a multipart form. Strict, because the API refuses a field it does not define.
 */
const filesUploadFieldsSchema = z.strictObject({
  uploadId: z.uuid(),
  folderId: z.optional(z.uuid()),
});

/** The form is the validated text fields plus the file part, which JSON Schema calls `binary`. */
function uploadFormSchema(): Record<string, unknown> {
  const fields = contractSchema('FilesUploadForm', filesUploadFieldsSchema, {
    io: 'input',
    describe: {
      uploadId:
        'Identity of this upload, a UUID the client generates: one per file the user picked, kept for every retry of that file, never reused for another file. It makes the upload safe to send again (see above). Case is ignored.',
      folderId:
        'Identifier of the folder to place the file in. Omit the field for the top level: `root` and an empty value are refused here. Ignored when the answer is an existing file (`deduplicated`, or a replayed `uploadId`).',
    },
  });
  return {
    ...fields,
    required: ['file', 'uploadId'],
    properties: {
      file: {
        type: 'string',
        format: 'binary',
        description:
          'The file, as one part named `file` with a `filename`. Exactly one. Its `filename` (UTF-8) becomes the display name once cleaned; the `Content-Type` of the part and the extension of the name are ignored, the type is read from the bytes.',
      },
      ...(fields.properties as Record<string, unknown>),
    },
  };
}

/** The text fields of every example are checked like a JSON body; the file part is a placeholder. */
function uploadFormExamples(
  examples: Readonly<Record<string, ApiExample & { readonly value: Record<string, string> }>>,
): Readonly<Record<string, ApiExample>> {
  for (const [key, { value }] of Object.entries(examples)) {
    const fields = Object.fromEntries(Object.entries(value).filter(([name]) => name !== 'file'));
    checkApiDocsExample(`FilesUploadForm (${key})`, filesUploadFieldsSchema, fields);
  }
  return examples;
}

export const DocUploadFile = () =>
  applyDecorators(
    ApiRoute(
      'Upload a file to the personal library',
      `Stores one file and answers its library entry. The body is \`${MULTIPART}\`: one \`file\` part and the text field \`uploadId\`, optionally \`folderId\`. Nothing else: an unknown text field is a \`400\`.

**What is accepted.** PDF, DOCX, PNG, JPEG, WebP and GIF, decided from the bytes alone. Anything else is a \`415\`, whatever its name says: SVG, legacy \`.doc\`, a spreadsheet or any ZIP that is not a Word document. A macro-enabled Word document, an empty file or an abnormal archive is a \`422\`. The size limit is \`maxFileBytes\` and the room left is \`limitBytes - usedBytes - reservedBytes\`, both read from \`GET /api/files/quota\`.

**The name.** Taken from the \`filename\` of the part: any path is dropped, the name is ${FILES_NAME_CLEANING}, and its extension is replaced by the one of the detected type (\`.pdf\`, \`.docx\`, \`.png\`, \`.jpg\`, \`.webp\`, \`.gif\`). A name of which nothing is left becomes \`fichier\`. When the folder already holds that name, without regard to case, the new file is called \`name (2).pdf\`, \`name (3).pdf\`…: an upload never overwrites.

**Sending again is safe (\`uploadId\`).** After a timeout or a lost answer, send the same bytes with the same \`uploadId\`: the answer is the file the first attempt created, with \`201\`, and nothing is stored or charged twice. An attempt that stopped half-way is completed under the same identity. The same \`uploadId\` with other bytes, or one whose file was deleted since, answers \`409 file_upload_conflict\`.

**The same bytes twice.** Bytes the library already holds (same SHA-256, under any name or folder) are not stored again: the answer is the existing file with \`deduplicated: true\`, still \`201\`; the quota is not charged and the \`filename\` and \`folderId\` sent are ignored.

**After the answer.** The file is \`processing\`: its text is extracted, or its reduced copy prepared, off the request path. Poll \`GET /api/files/{id}\` until \`ready\` or \`failed\`. ${FILES_ATTACH_RULE}

**Limits on the request itself.**
- At most ${FILE_MAX_CONCURRENT_UPLOADS_PER_USER} uploads of one account in flight, and a fixed number per API instance (4 by default). One more answers \`503 upload_busy\` at once, before its body is read: queue on the client, ${FILE_MAX_CONCURRENT_UPLOADS_PER_USER} at a time, and retry after a short delay.
- Its own rate limit per account (20 uploads a minute by default, against 120 requests for the general one): \`429\` with the wait in seconds in the \`Retry-After-file-upload-user\` header.
- The body must arrive within a deadline sized for the largest accepted file at 64 KiB/s, never under 30 seconds (80 seconds with the default limit). Past it the connection is closed without an answer.
- Closing the connection before the answer cancels the upload: nothing is published, nothing is charged.`,
    ),
    ApiConsumes(MULTIPART),
    ApiBody({
      description:
        'A multipart form: the `file` part and the text fields below. At most 4 text fields of at most 1 024 bytes each.',
      required: true,
      schema: uploadFormSchema(),
      examples: uploadFormExamples({
        topLevel: {
          summary: 'A PDF to the top level of the library',
          value: { file: '(binary content of Contrat cadre.pdf)', uploadId: UPLOAD_ID },
        },
        intoFolder: {
          summary: 'An image into a folder',
          value: {
            file: '(binary content of Schéma réseau.png)',
            uploadId: '0a7c4e19-5d2b-4f86-b3a1-8e6f9c0d2b57',
            folderId: FILES_FOLDER_ID,
          },
        },
      }),
    }),
    ApiEnvelopeResponse({
      name: 'FilesUploadResult',
      status: 201,
      description:
        'The file is in the library. Also the answer of a replayed `uploadId` and of bytes the library already held: read `deduplicated` and `file.id`, not the status.',
      contract: fileUploadEnvelopeSchema,
      describe: {
        'data.file':
          'The library entry: a new one, or the existing one when the upload was a replay or a duplicate.',
        ...filesStoredFileFields('data.file.'),
        'data.deduplicated':
          '`true` when these bytes were already in the library: `file` is that earlier file, as it is today (its own name, folder, labels and readiness), nothing new is kept and the quota was not charged. `false` for a new file and for the replay of the `uploadId` that created it.',
      },
      data: { file: filesJustUploadedPdf, deduplicated: false },
      more: {
        deduplicated: {
          summary: 'The library already held these bytes: the earlier file is answered',
          data: { file: filesReadyPdf, deduplicated: true },
        },
        replayed: {
          summary: 'Same `uploadId` and bytes sent again: the file of the first attempt',
          data: { file: filesReadyImage, deduplicated: false },
        },
      },
    }),
    ApiErrors(
      {
        status: 400,
        code: 'HTTP_400',
        message: ['uploadId must be a UUID'],
        when: '`uploadId` is missing or is not a UUID. Also the answer of a request without any body.',
      },
      {
        status: 400,
        code: 'HTTP_400',
        message: ['folderId must be a UUID'],
        when: '`folderId` is present and is not a UUID, `root` and an empty value included. Omit the field for the top level.',
      },
      {
        status: 400,
        code: 'HTTP_400',
        message: ['property name should not exist'],
        when: 'The form carries a text field other than `uploadId` and `folderId`. Nothing is ignored silently.',
      },
      {
        status: 400,
        code: 'file_rejected',
        message: 'A file is required.',
        when: 'The form has no `file` part, or the body is not `multipart/form-data` (a JSON body for example). Checked after the text fields.',
      },
      FILES_FOLDER_NOT_FOUND,
      ...FILES_ACCESS_PROBLEMS,
      {
        status: 409,
        code: 'quota_exceeded',
        message: 'The file storage quota is reached.',
        details: { usedBytes: 25_960_122, reservedBytes: 0, limitBytes: 26_214_400 },
        when: 'The file does not fit: `usedBytes + reservedBytes + size > limitBytes`. `details` holds the figures. Delete files, or wait for the uploads in flight when `reservedBytes` is not zero, then send again with the same `uploadId`.',
      },
      {
        status: 409,
        code: 'file_upload_conflict',
        message: 'This upload identity was already used for another file.',
        when: 'This `uploadId` was already used with other bytes, or the file it created was deleted since. Generate a new `uploadId`.',
      },
      {
        status: 409,
        code: 'file_upload_conflict',
        message: 'The upload expired. Send it again.',
        when: 'Storing the bytes outlasted the quota reservation (5 minutes by default). Nothing was published. Send again, the same `uploadId` is fine.',
      },
      {
        status: 409,
        code: 'file_name_conflict',
        message: 'Too many files share this name.',
        when: 'The folder already holds this name and its 199 suffixed variants. Rename the file before sending it.',
      },
      {
        status: 413,
        code: 'file_too_large',
        message: 'The file exceeds the size limit.',
        details: { maxFileBytes: 5_242_880 },
        when: 'The file is larger than `details.maxFileBytes`. Decided from `Content-Length` before anything is read when it is declared, otherwise while the body streams in. Do not retry.',
      },
      {
        status: 415,
        code: 'unsupported_media_type',
        message: 'This file type is not accepted.',
        when: 'The leading bytes are not those of a PDF, a DOCX, a PNG, a JPEG, a WebP or a GIF, or the ZIP container is not a Word document. The name and the declared type play no part. Do not retry.',
      },
      {
        status: 422,
        code: 'file_rejected',
        message: 'The file is empty.',
        when: 'The `file` part holds no byte.',
      },
      {
        status: 422,
        code: 'file_rejected',
        message: 'The file could not be accepted.',
        when: 'A DOCX that is unsafe to open: macro-enabled, a damaged or oversized archive (more than 2 048 entries, more than 100 MiB once inflated, an entry compressed over a hundredfold), or an unsafe entry name. Do not retry.',
      },
      {
        status: 429,
        code: 'HTTP_429',
        message: 'ThrottlerException: Too Many Requests',
        when: 'The upload rate limit of the account is reached. Wait for the number of seconds of the `Retry-After-file-upload-user` header.',
      },
      {
        status: 499,
        code: 'upload_cancelled',
        message: 'The upload was cancelled by the client.',
        when: 'The client closed the connection before the answer, so nobody reads this; it exists for proxy logs. It is also what a form the multipart parser refuses receives today: a file part under another name than `file`, a second file part, more than 4 text fields, or a text field over 1 024 bytes.',
      },
      {
        status: 503,
        code: 'upload_busy',
        message: 'Internal server error',
        when: `No upload slot is free: the account already has ${FILE_MAX_CONCURRENT_UPLOADS_PER_USER} uploads in flight, or the instance is full. Nothing was read. Retry after a short delay. Branch on the code: the message of a \`5xx\` is always generic.`,
      },
      {
        status: 503,
        code: 'storage_unavailable',
        message: 'Internal server error',
        when: 'The file storage refused the write. Nothing was published and the reservation was released. Retry later with the same `uploadId`.',
      },
    ),
  );
