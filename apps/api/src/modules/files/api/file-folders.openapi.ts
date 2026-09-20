import {
  FOLDER_MAX_COUNT,
  FOLDER_MAX_DEPTH,
  FOLDER_NAME_MAX_LENGTH,
  createFolderInputSchema,
  fileFolderEnvelopeSchema,
  fileFolderListEnvelopeSchema,
  updateFolderInputSchema,
} from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiIdParam,
  ApiJsonBody,
  ApiRoute,
  type ApiProblem,
} from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';

const CONTRACTS_ID = '6d1f0a52-3b7e-4c19-8a44-9e2b5c7d1f03';
const INVOICES_ID = 'e84c2f17-0d9a-4b6e-a1f5-7c3d9b0e2a46';
const YEAR_ID = 'b2a7c9e4-58d1-4f60-9b3c-0a6e1d2f4c85';

const folderFields = (prefix: string) => ({
  [`${prefix}id`]:
    'Identifier of the folder. Use it as `parentId` of a sub-folder, as `folderId` when uploading or moving a file, and as the `folderId` filter of `GET /api/files`.',
  [`${prefix}name`]:
    'Display name as stored, after cleaning (see `POST /api/files/folders`). Unique among the folders of the same parent, without regard to case.',
  [`${prefix}parentId`]: 'Identifier of the containing folder; `null` for a top-level folder.',
  [`${prefix}depth`]: `Level in the tree: \`1\` at the top level, the parent's depth plus one below, at most ${FOLDER_MAX_DEPTH}. Computed by the API, never sent by a caller.`,
  [`${prefix}fileCount`]:
    'Number of files placed directly in this folder. Files of its sub-folders and deleted files are not counted.',
  [`${prefix}createdAt`]: 'When the folder was created (UTC).',
  [`${prefix}updatedAt`]: 'When the folder was last renamed or moved (UTC).',
});

const contracts = {
  id: CONTRACTS_ID,
  name: 'Contrats',
  parentId: null,
  depth: 1,
  fileCount: 0,
  createdAt: '2026-09-18T09:12:41.530Z',
  updatedAt: '2026-09-18T09:12:41.530Z',
};
const invoices = {
  id: INVOICES_ID,
  name: 'Factures',
  parentId: null,
  depth: 1,
  fileCount: 12,
  createdAt: '2026-09-18T09:14:03.118Z',
  updatedAt: '2026-09-19T17:40:22.904Z',
};
const year = {
  id: YEAR_ID,
  name: '2026',
  parentId: CONTRACTS_ID,
  depth: 2,
  fileCount: 1,
  createdAt: '2026-09-18T09:13:05.772Z',
  updatedAt: '2026-09-18T09:13:05.772Z',
};

const NAME_CLEANING =
  'trimmed, normalised to Unicode NFC, control characters (line breaks included) and invisible direction or zero-width marks removed, `/`, `\\` and `:` replaced by `-`, runs of white space replaced by one space';

const FOLDER_NOT_FOUND: ApiProblem = {
  ...PROBLEM.notFound('folder'),
  when: 'The folder of the path does not exist, belongs to another account, or the identifier is not a UUID. The three cases are indistinguishable by design.',
};
const PARENT_NOT_FOUND: ApiProblem = {
  ...PROBLEM.notFound('folder'),
  when: '`parentId` names a folder that does not exist or belongs to another account; the two cases are indistinguishable by design. (A `parentId` that is not a UUID is a `400`.)',
};
const INVALID_NAME: ApiProblem = {
  status: 400,
  code: 'invalid_name',
  message: 'This name is not valid.',
  when: 'Nothing is left of `name` once cleaned (for example only control characters), or the cleaned name is `.` or `..`. Ask for another name.',
};
const DEPTH_EXCEEDED = (when: string): ApiProblem => ({
  status: 409,
  code: 'folder_depth_exceeded',
  message: 'Folders cannot be nested deeper.',
  when,
});
const NAME_CONFLICT = (when: string): ApiProblem => ({
  status: 409,
  code: 'folder_name_conflict',
  message: 'A folder with this name already exists.',
  when,
});

/** One message per broken field: the validation stops at the first broken rule of each field. */
const bodyProblems = (emptyName: string): readonly ApiProblem[] => [
  PROBLEM.validation(emptyName, 'name must be longer than or equal to 1 characters'),
  PROBLEM.validation(
    `\`name\` is longer than ${FOLDER_NAME_MAX_LENGTH} characters once trimmed.`,
    `name must be shorter than or equal to ${FOLDER_NAME_MAX_LENGTH} characters`,
  ),
  PROBLEM.validation(
    '`name` is not a string.',
    `name must be longer than or equal to 1 and shorter than or equal to ${FOLDER_NAME_MAX_LENGTH} characters`,
  ),
  PROBLEM.validation(
    '`parentId` is neither a UUID nor `null`. A request that also breaks a `name` rule lists both messages.',
    'parentId must be a UUID',
  ),
  PROBLEM.unknownField,
  PROBLEM.invalidJson,
  INVALID_NAME,
];

export const DocListFolders = () =>
  applyDecorators(
    ApiRoute(
      'List the folders of the personal library',
      `Every folder of the signed-in account in one answer. The tree is small (at most ${FOLDER_MAX_COUNT} folders), so this list has no pagination, no filter and no \`nextCursor\`.

- Parents always come before their children: folders are sorted by \`depth\`, then by name without regard to case. Rebuild the tree from \`parentId\`.
- \`fileCount\` counts the files placed directly in a folder. List them with \`GET /api/files?folderId=<id>\`; \`folderId=root\` lists the files that are in no folder.
- A folder is a label on the library, never a storage path: renaming or moving one changes no file identifier and no file content.
- An account without folders answers an empty \`items\`.`,
    ),
    ApiEnvelopeResponse({
      name: 'FileFoldersList',
      description: 'The whole folder tree, flat, parents first.',
      contract: fileFolderListEnvelopeSchema,
      describe: folderFields('data.items[].'),
      data: { items: [contracts, invoices, year] },
      more: {
        empty: { summary: 'No folder yet: every file is at the top level', data: { items: [] } },
      },
    }),
    ApiErrors(
      PROBLEM.unauthenticated,
      PROBLEM.invalidToken,
      PROBLEM.featureDisabled('fileUploads'),
    ),
  );

export const DocCreateFolder = () =>
  applyDecorators(
    ApiRoute(
      'Create a folder',
      `Creates a folder at the top level, or inside \`parentId\`. Answers \`201\` with the stored folder (\`fileCount: 0\`).

- **Name cleaning**: the name is ${NAME_CLEANING}. The answer carries the name as stored: display that one, not the one you sent.
- **Unique among siblings**, without regard to case: \`Contrats\` and \`CONTRATS\` cannot share a parent (\`409 folder_name_conflict\`). The same name under another parent is fine.
- **Limits**: ${FOLDER_MAX_DEPTH} levels (\`409 folder_depth_exceeded\`) and ${FOLDER_MAX_COUNT} folders per account (\`409 folder_limit_reached\`).
- Refusals are checked in this order: body validation, \`invalid_name\`, \`folder_limit_reached\`, parent \`folder_not_found\`, \`folder_depth_exceeded\`, \`folder_name_conflict\`.
- **Not idempotent**: a replay of a request that succeeded answers \`409 folder_name_conflict\`. After a network failure, read \`GET /api/files/folders\` before retrying.
- The API serialises the writes to one account's library, so two concurrent requests cannot both create the same name.`,
    ),
    ApiJsonBody({
      name: 'FileFoldersCreateInput',
      description: 'The name of the new folder and, optionally, where to put it.',
      contract: createFolderInputSchema,
      describe: {
        name: `Name of the folder, 1 to ${FOLDER_NAME_MAX_LENGTH} characters once trimmed. It is then cleaned (see the route description) and must be free among the folders of the same parent, without regard to case.`,
        parentId: `Identifier of the folder to create it in, which must belong to the signed-in account and be at most at depth ${FOLDER_MAX_DEPTH - 1}. Omitted or \`null\`: the top level.`,
      },
      examples: {
        topLevel: { summary: 'A folder at the top level', value: { name: 'Contrats' } },
        nested: {
          summary: 'A sub-folder of an existing folder',
          value: { name: '2026', parentId: CONTRACTS_ID },
        },
      },
    }),
    ApiEnvelopeResponse({
      name: 'FileFoldersCreated',
      status: 201,
      description: 'The folder as stored. It is empty.',
      contract: fileFolderEnvelopeSchema,
      describe: folderFields('data.'),
      data: { ...year, fileCount: 0 },
      more: { topLevel: { summary: 'Created at the top level', data: contracts } },
    }),
    ApiErrors(
      ...bodyProblems('`name` is missing, `null`, or empty once trimmed.'),
      PROBLEM.unauthenticated,
      PROBLEM.invalidToken,
      PARENT_NOT_FOUND,
      PROBLEM.featureDisabled('fileUploads'),
      {
        status: 409,
        code: 'folder_limit_reached',
        message: 'The folder limit is reached.',
        when: `The account already holds ${FOLDER_MAX_COUNT} folders. Delete a folder, then retry.`,
      },
      DEPTH_EXCEEDED(
        `The parent is already at depth ${FOLDER_MAX_DEPTH}, the deepest level. Create the folder higher in the tree.`,
      ),
      NAME_CONFLICT(
        'A folder of the same parent already has this name, without regard to case. Choose another name, or use the existing folder.',
      ),
      PROBLEM.bodyTooLarge,
    ),
  );

export const DocUpdateFolder = () =>
  applyDecorators(
    ApiRoute(
      'Rename or move a folder',
      `Partial update: send \`name\` to rename, \`parentId\` to move, both to do the two at once. An omitted field is left as it is; an empty object \`{}\` renames and moves nothing and answers the folder.

- **Move**: \`parentId\` is the new containing folder; \`null\` moves the folder to the top level. The whole subtree follows, files included, and the API recomputes \`depth\` for the folder and all its descendants. Only the moved folder is returned: read \`GET /api/files/folders\` again for the new depths of its descendants.
- A folder cannot be moved into itself or into one of its descendants (\`409 folder_cycle\`), nor to a place where its deepest descendant would pass level ${FOLDER_MAX_DEPTH} (\`409 folder_depth_exceeded\`).
- **Rename**: same cleaning and same uniqueness among siblings as on creation. On a move the name is checked against the folders of the destination. Changing only the letter case of the folder's own name is allowed.
- There is no concurrency token on a folder: the last write wins. The API serialises the writes to one account's library.
- Renaming or moving a folder changes no file: identifiers, content and downloads stay the same.`,
    ),
    ApiIdParam(
      'id',
      'Identifier of the folder to rename or move, as listed by `GET /api/files/folders`.',
      YEAR_ID,
    ),
    ApiJsonBody({
      name: 'FileFoldersUpdateInput',
      description: 'The fields to change. Every field is optional.',
      contract: updateFolderInputSchema,
      describe: {
        name: `New name, 1 to ${FOLDER_NAME_MAX_LENGTH} characters once trimmed, cleaned as on creation. Omit it to keep the current name.`,
        parentId:
          'New containing folder, which must belong to the signed-in account; `null` moves the folder to the top level. Omit it to leave the folder where it is.',
      },
      examples: {
        rename: { summary: 'Rename in place', value: { name: 'Archives 2026' } },
        move: { summary: 'Move into another folder', value: { parentId: INVOICES_ID } },
        moveToTopLevel: { summary: 'Move to the top level', value: { parentId: null } },
        renameAndMove: {
          summary: 'Rename and move in one call',
          value: { name: 'Archives 2026', parentId: null },
        },
      },
    }),
    ApiEnvelopeResponse({
      name: 'FileFoldersUpdated',
      description: 'The folder after the change.',
      contract: fileFolderEnvelopeSchema,
      describe: {
        ...folderFields('data.'),
        'data.updatedAt':
          'In this answer, the time of the previous change: the value is read before the update is written. `GET /api/files/folders` returns the new one.',
      },
      data: { ...year, name: 'Archives 2026' },
      more: {
        movedToTopLevel: {
          summary: 'Renamed and moved to the top level: `parentId` is `null`, `depth` is 1',
          data: { ...year, name: 'Archives 2026', parentId: null, depth: 1 },
        },
      },
    }),
    ApiErrors(
      ...bodyProblems('`name` is sent but empty once trimmed.'),
      PROBLEM.unauthenticated,
      PROBLEM.invalidToken,
      FOLDER_NOT_FOUND,
      PARENT_NOT_FOUND,
      PROBLEM.featureDisabled('fileUploads'),
      {
        status: 409,
        code: 'folder_cycle',
        message: 'A folder cannot be moved into itself.',
        when: '`parentId` is the folder itself or one of its descendants. Choose a destination outside the moved subtree.',
      },
      DEPTH_EXCEEDED(
        `Under the new parent, the folder or its deepest descendant would pass level ${FOLDER_MAX_DEPTH}. Move it higher, or flatten the subtree first.`,
      ),
      NAME_CONFLICT(
        'Another folder of the destination parent already has this name, without regard to case. Rename in the same call, or choose another destination.',
      ),
      PROBLEM.bodyTooLarge,
    ),
  );

export const DocDeleteFolder = () =>
  applyDecorators(
    ApiRoute(
      'Delete an empty folder',
      `Deletes a folder that holds nothing: no sub-folder and no file. Answers \`204\` without a body.

- A folder that still holds a sub-folder or a file answers \`409 folder_not_empty\` and nothing is deleted. The API never deletes files as a side effect of a folder: move them (\`PATCH /api/files/{id}\` with another \`folderId\`, or \`null\`) or delete them (\`DELETE /api/files/{id}\`), do the same for the sub-folders, then retry.
- Deleted files do not count: a folder whose files were all deleted is empty.
- Permanent: there is no trash for folders. Not idempotent: a second call answers \`404 folder_not_found\`, which after a network failure means the folder is gone.`,
    ),
    ApiIdParam(
      'id',
      'Identifier of the folder to delete, as listed by `GET /api/files/folders`.',
      YEAR_ID,
    ),
    ApiResponse({ status: 204, description: 'The folder is deleted. No body.' }),
    ApiErrors(
      PROBLEM.unauthenticated,
      PROBLEM.invalidToken,
      FOLDER_NOT_FOUND,
      PROBLEM.featureDisabled('fileUploads'),
      {
        status: 409,
        code: 'folder_not_empty',
        message: 'Move or delete its content first.',
        when: 'The folder still holds at least one sub-folder or one file. Empty it, then retry.',
      },
    ),
  );
