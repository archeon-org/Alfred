import {
  FILE_DESCRIPTION_MAX_LENGTH,
  FILE_MAX_TAGS,
  FILE_NAME_MAX_LENGTH,
  FILE_TAG_MAX_LENGTH,
  fileEnvelopeSchema,
  fileListEnvelopeSchema,
  fileQuotaEnvelopeSchema,
  updateFileInputSchema,
} from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiJsonBody,
  ApiRoute,
} from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';
import {
  FILES_ACCESS_PROBLEMS,
  FILES_ATTACH_RULE,
  FILES_FOLDER_ID,
  FILES_FOLDER_NOT_FOUND,
  FILES_NAME_CLEANING,
  FILES_NOT_FOUND,
  FilesIdParam,
  filesFailedScan,
  filesJustUploadedPdf,
  filesReadyImage,
  filesReadyPdf,
  filesStoredFileFields,
} from './files-shared.openapi';

export const DocListFiles = () =>
  applyDecorators(
    ApiRoute(
      'List the files of the personal library',
      `The files the signed-in account uploaded, paged by cursor. Read-only. A deleted file never appears.

- **Order**: newest upload first (\`createdAt\`, then \`id\`), stable across pages.
- **Filters** combine with AND. Without \`folderId\` the whole library is listed, whatever the folder; with a folder identifier, only the files placed directly in it (not those of its sub-folders); with \`folderId=root\`, the files of the top level. A folder or a conversation that does not exist, or belongs to someone else, answers an empty list, not a \`404\`.
- **Paging**: \`limit\` 1 to 100 (default 20). Send \`data.nextCursor\` back unchanged as \`cursor\` with the same filters; \`nextCursor: null\` is the last page.
- **Following an upload**: processing happens after the upload answered and nothing is pushed. Re-read \`GET /api/files/{id}\`, or list with \`readiness=processing\`, until the file is \`ready\` or \`failed\`. ${FILES_ATTACH_RULE}`,
    ),
    ApiEnvelopeResponse({
      name: 'FilesPage',
      description: 'One page of the library, newest upload first.',
      contract: fileListEnvelopeSchema,
      describe: filesStoredFileFields('data.items[].'),
      data: { items: [filesReadyImage, filesReadyPdf, filesFailedScan], nextCursor: null },
      more: {
        empty: {
          summary: 'Empty library, or no file matches the filters',
          data: { items: [], nextCursor: null },
        },
        processing: {
          summary: '`readiness=processing`: the uploads that are still being read',
          data: { items: [filesJustUploadedPdf], nextCursor: null },
        },
      },
    }),
    ApiErrors(
      PROBLEM.validation(
        'A filter or `limit` breaks its rule. One message per broken parameter.',
        'kind must be one of the following values: pdf, docx, image',
        'readiness must be one of the following values: processing, ready, failed',
        'folderId must match /^(root|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu regular expression',
        'conversationId must be a UUID',
        'search must be shorter than or equal to 100 characters',
        'tag must be shorter than or equal to 40 characters',
        'limit must not be greater than 100',
      ),
      PROBLEM.unknownField,
      PROBLEM.invalidCursor,
      ...FILES_ACCESS_PROBLEMS,
    ),
  );

export const DocGetFileQuota = () =>
  applyDecorators(
    ApiRoute(
      'Read the storage quota and the upload size limit',
      `How much of its library the signed-in account uses, and the limits of this deployment. Read it before an upload to refuse early what the API would refuse, and after an upload or a deletion to refresh a gauge.

An upload is admitted when \`usedBytes + reservedBytes + <size of the file> <= limitBytes\` and the file is at most \`maxFileBytes\`. A deletion frees its bytes as soon as it answers. Extracted text and the reduced copies of images are not counted.`,
    ),
    ApiEnvelopeResponse({
      name: 'FilesQuota',
      description: 'The usage of the account and the limits of the deployment.',
      contract: fileQuotaEnvelopeSchema,
      describe: {
        'data.usedBytes':
          'Sum of the sizes of the stored original files, in bytes. Bytes uploaded twice are stored and counted once (see `deduplicated` on the upload).',
        'data.reservedBytes':
          'Bytes held by uploads that are in flight: admitted, not yet in the library. A reservation that is never completed stops counting when it expires (5 minutes by default).',
        'data.limitBytes':
          'Storage limit of one account on this deployment, in bytes. Default 26 214 400 (25 MiB).',
        'data.maxFileBytes':
          'Largest file this deployment accepts, in bytes. Default 5 242 880 (5 MiB); a deployment can raise it up to 26 214 400 (25 MiB), never above `limitBytes`.',
      },
      data: {
        usedBytes: 1_905_398,
        reservedBytes: 0,
        limitBytes: 26_214_400,
        maxFileBytes: 5_242_880,
      },
      more: {
        uploading: {
          summary: 'While an upload of 482 113 bytes is in flight',
          data: {
            usedBytes: 1_423_285,
            reservedBytes: 482_113,
            limitBytes: 26_214_400,
            maxFileBytes: 5_242_880,
          },
        },
        empty: {
          summary: 'Empty library',
          data: {
            usedBytes: 0,
            reservedBytes: 0,
            limitBytes: 26_214_400,
            maxFileBytes: 5_242_880,
          },
        },
      },
    }),
    ApiErrors(...FILES_ACCESS_PROBLEMS),
  );

export const DocGetFile = () =>
  applyDecorators(
    ApiRoute(
      'Read a file of the library',
      `The library entry of one file: its name, type, size, place, labels, processing state and usage. The bytes are served by \`GET /api/files/{id}/content\`.

This is the route to poll after an upload: \`readiness\` goes from \`processing\` to \`ready\` or \`failed\`. ${FILES_ATTACH_RULE}`,
    ),
    FilesIdParam(),
    ApiEnvelopeResponse({
      name: 'FilesFile',
      description: 'The library entry.',
      contract: fileEnvelopeSchema,
      describe: filesStoredFileFields('data.'),
      data: filesReadyPdf,
      more: {
        processing: {
          summary: 'Just uploaded: not attachable yet',
          data: filesJustUploadedPdf,
        },
        failed: {
          summary: 'A scanned PDF without a text layer: kept, downloadable, never attachable',
          data: filesFailedScan,
        },
        image: { summary: 'An image, ready: it has a preview', data: filesReadyImage },
      },
    }),
    ApiErrors(FILES_NOT_FOUND, ...FILES_ACCESS_PROBLEMS),
  );

export const DocUpdateFile = () =>
  applyDecorators(
    ApiRoute(
      'Rename, move, tag or describe a file',
      `Changes the library entry of a file; the bytes never change. Only the fields present in the body are touched, and an empty body \`{}\` changes nothing and answers the file.

- **No concurrency token**: the last write wins. Changes of one library are serialised, so two concurrent renames cannot both take the same name.
- **Rename**: the name is ${FILES_NAME_CLEANING}. The extension is not yours to choose: a last \`.xxx\` segment of 1 to 10 characters without white space is dropped and the extension of the current name is put back (\`Pièce jointe\` and \`Pièce jointe.txt\` both give \`Pièce jointe.pdf\`). A name of which nothing is left answers \`400 invalid_name\`.
- **Move**: \`folderId\` is a folder of the account, or \`null\` for the top level.
- **Name collisions fail, they never overwrite**: a rename or a move onto a name another file of the target folder already holds, without regard to case, answers \`409 file_name_conflict\`. Unlike the upload, no \`(2)\` suffix is added.
- Works whatever the \`readiness\` of the file.
- The answer is built from the entry as it was read before the write: every changed field is up to date, but \`updatedAt\` still shows the previous value. Re-read the file when you need the new one.`,
    ),
    FilesIdParam(),
    ApiJsonBody({
      name: 'FilesUpdateInput',
      description:
        'The fields to change. Any subset; an absent field is left as it is. Unknown fields are refused.',
      contract: updateFileInputSchema,
      describe: {
        name: `New display name, 1 to ${FILE_NAME_MAX_LENGTH} characters once trimmed. Cleaned, and its extension replaced by the current one (see above).`,
        folderId:
          'Identifier of the folder to move the file to; `null` moves it to the top level. Omit it to leave the file where it is.',
        tags: `The complete new list of labels: it replaces the current one, \`[]\` removes them all. At most ${FILE_MAX_TAGS} labels of 1 to ${FILE_TAG_MAX_LENGTH} characters. Each is trimmed; blank labels and duplicates are dropped, the order is kept.`,
        description: `Free text of at most ${FILE_DESCRIPTION_MAX_LENGTH} characters, trimmed. \`null\`, an empty or a blank string removes the description.`,
      },
      examples: {
        rename: { summary: 'Rename in place', value: { name: 'Contrat cadre 2026' } },
        move: { summary: 'Move to a folder', value: { folderId: FILES_FOLDER_ID } },
        moveToTop: { summary: 'Move back to the top level', value: { folderId: null } },
        label: {
          summary: 'Replace the labels and the description',
          value: { tags: ['juridique', '2026'], description: 'Version signée' },
        },
        clear: {
          summary: 'Remove the labels and the description',
          value: { tags: [], description: null },
        },
      },
    }),
    ApiEnvelopeResponse({
      name: 'FilesUpdatedFile',
      description: 'The file with the changes applied.',
      contract: fileEnvelopeSchema,
      describe: filesStoredFileFields('data.'),
      data: { ...filesReadyPdf, name: 'Contrat cadre 2026.pdf' },
      more: {
        movedToTop: {
          summary: 'After `{ "folderId": null }`',
          data: { ...filesReadyPdf, folderId: null },
        },
        cleared: {
          summary: 'After `{ "tags": [], "description": null }`',
          data: { ...filesReadyPdf, tags: [], description: null },
        },
      },
    }),
    ApiErrors(
      PROBLEM.validation(
        'A field breaks its rule. One message per broken field.',
        'name must be longer than or equal to 1 characters',
        'name must be shorter than or equal to 255 characters',
        'folderId must be a UUID',
        'tags must contain no more than 16 elements',
        'each value in tags must be longer than or equal to 1 and shorter than or equal to 40 characters',
        'description must be shorter than or equal to 1024 characters',
      ),
      PROBLEM.unknownField,
      PROBLEM.invalidJson,
      {
        status: 400,
        code: 'invalid_name',
        message: 'This name is not valid.',
        when: 'Nothing is left of `name` once cleaned (it held only removed characters), or it is `.` or `..`.',
      },
      FILES_NOT_FOUND,
      FILES_FOLDER_NOT_FOUND,
      ...FILES_ACCESS_PROBLEMS,
      {
        status: 409,
        code: 'file_name_conflict',
        message: 'A file with this name already exists.',
        when: 'Another file of the target folder already holds this name, without regard to case. Nothing was changed, the other fields of the body included. Choose another name or another folder.',
      },
      PROBLEM.bodyTooLarge,
    ),
  );

export const DocDeleteFile = () =>
  applyDecorators(
    ApiRoute(
      'Delete a file for good',
      `Removes the file from the library. There is no bin and no undo.

- The entry disappears at once: every route answers \`404 file_not_found\` for it, this one included if it is called again.
- Its size leaves \`usedBytes\` as soon as this answers; its bytes, its extracted text and its reduced copy are purged from storage right after.
- The messages that carried it keep its name in the transcript, marked as no longer available; its content is not sent to the model again. \`usage\` tells beforehand how many messages that is.
- The \`uploadId\` that created it is spent: sending the same bytes again needs a new \`uploadId\` and creates a new file with a new \`id\`.
- A file an answer is being written from cannot be deleted: \`409 file_in_use\`.`,
    ),
    FilesIdParam(),
    ApiResponse({ status: 204, description: 'Deleted. No body.' }),
    ApiErrors(FILES_NOT_FOUND, ...FILES_ACCESS_PROBLEMS, {
      status: 409,
      code: 'file_in_use',
      message: 'An answer is currently using this file.',
      when: 'A message that carries the file has an execution that is not finished. Wait for the answer to end, or stop it, then delete again.',
    }),
  );
