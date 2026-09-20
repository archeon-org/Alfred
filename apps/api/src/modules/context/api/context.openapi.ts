import {
  contextDocumentEnvelopeSchema,
  contextDocumentSetEnvelopeSchema,
  saveContextDocumentInputSchema,
} from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiIdParam,
  ApiJsonBody,
  ApiRoute,
  type ApiProblem,
} from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';

const PROJECT_ID = '3f0c6c0e-9c7b-4f2a-9a58-2d5a1c7e8b41';
const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const documentFields = (prefix: string) => ({
  [`${prefix}kind`]:
    'Which document: `instructions` or `preferences` for the account, `context` or `preferences` for a project.',
  [`${prefix}content`]: 'The Markdown text, with `\\n` line endings.',
  [`${prefix}revision`]:
    'Optimistic-write token. `0` with empty content and `updatedAt: null` means the document was never written. Send it back as `expectedRevision`.',
  [`${prefix}contentHash`]: 'SHA-256 of `content` encoded as UTF-8, lower-case hexadecimal.',
  [`${prefix}updatedAt`]: 'Last change (UTC); `null` for a document that was never written.',
});

const neverWritten = (kind: string) => ({
  kind,
  content: '',
  revision: 0,
  contentHash: EMPTY_HASH,
  updatedAt: null,
});
const personalPreferences = {
  kind: 'preferences',
  content: 'Français, concis, tableaux quand possible.',
  revision: 1,
  contentHash: '300f73b18fec57f496a5dba3adb8aea247d24b48229d5ce893ea89911a3307f7',
  updatedAt: '2026-09-20T16:48:44.899Z',
};
const projectContext = {
  kind: 'context',
  content: '# Projet LISAB\nFaits et consignes du projet.',
  revision: 1,
  contentHash: '71ed8241d535dfef2ac3b82bfaf9f462524da9316499efeb57e2cd6f3a1fe699',
  updatedAt: '2026-09-20T16:48:44.945Z',
};

const SET_DESCRIBE = {
  'data.maxBytes':
    'Storage limit of one document on this deployment, in UTF-8 bytes (default 65 536). A storage limit, not a prompt budget.',
  'data.documents': 'The two documents of the scope, always both, in a fixed order.',
  ...documentFields('data.documents[].'),
};

const SAVE_PROBLEMS: readonly ApiProblem[] = [
  PROBLEM.validation(
    '`expectedRevision` is missing, not an integer, or out of range.',
    'expectedRevision must not be greater than 2147483646',
    'expectedRevision must not be less than 0',
    'expectedRevision must be an integer number',
  ),
  PROBLEM.unknownField,
  PROBLEM.invalidJson,
  {
    status: 400,
    code: 'invalid_content',
    message: 'Invalid document kind for this scope.',
    when: 'The `kind` of the path does not belong to this scope, or `content` holds a NUL character or an unpaired surrogate.',
  },
  {
    status: 400,
    code: 'context_content_too_large',
    message: 'Context document exceeds its byte limit.',
    details: { maxBytes: 65536 },
    when: '`content` exceeds `maxBytes` once line endings are normalised. `details.maxBytes` holds the limit.',
  },
  PROBLEM.unauthenticated,
  PROBLEM.invalidToken,
  {
    status: 409,
    code: 'context_revision_conflict',
    message: 'The document changed. Reload before saving.',
    details: { currentRevision: 4 },
    when: '`expectedRevision` is not the current revision: someone saved in between. `details.currentRevision` holds the current one. Re-read and merge; never retry blindly with it, that would overwrite the other edit.',
  },
  PROBLEM.bodyTooLarge,
];

const saveBody = (name: string, value: { content: string; expectedRevision: number }) =>
  ApiJsonBody({
    name,
    description:
      'The whole new document and the revision it was read at. There is no partial update. Writing the stored content again succeeds and changes nothing.',
    contract: saveContextDocumentInputSchema,
    describe: {
      content:
        'The complete Markdown text. `\\r\\n` and `\\r` are stored as `\\n`. At most `maxBytes` UTF-8 bytes. No NUL character, no unpaired surrogate. An empty string resets the document and still increases the revision.',
      expectedRevision:
        'The `revision` last read for this document; `0` to create it. 0 to 2 147 483 646.',
    },
    examples: {
      update: { summary: 'Replace the document read at the given revision', value },
      create: {
        summary: 'First write of a document that was never written',
        value: { ...value, expectedRevision: 0 },
      },
    },
  });

export const DocListPersonalContext = () =>
  applyDecorators(
    ApiRoute(
      'Read the general instructions and response preferences',
      'The two personal documents of the signed-in account (Paramètres › Personnaliser Alfred): `instructions` then `preferences`. A document that was never written is returned with `revision: 0` and empty content, never omitted.',
    ),
    ApiEnvelopeResponse({
      name: 'PersonalContextDocuments',
      description: 'Both personal documents.',
      contract: contextDocumentSetEnvelopeSchema,
      describe: SET_DESCRIBE,
      data: { maxBytes: 65536, documents: [neverWritten('instructions'), personalPreferences] },
    }),
    ApiErrors(PROBLEM.unauthenticated, PROBLEM.invalidToken),
  );

export const DocSavePersonalContext = () =>
  applyDecorators(
    ApiRoute(
      'Update the general instructions or response preferences',
      "Replaces one personal document of the signed-in account. These are the user's own settings: the settings screen writes them, an agent only reads them. The answer is the stored document: a changed document comes back with `expectedRevision + 1`.",
    ),
    ApiParam({
      name: 'kind',
      description: 'The personal document to write.',
      schema: { type: 'string', enum: ['instructions', 'preferences'], example: 'preferences' },
    }),
    saveBody('SavePersonalContextDocument', {
      content: 'Français, concis, tableaux quand possible.',
      expectedRevision: 3,
    }),
    ApiEnvelopeResponse({
      name: 'SavedPersonalContextDocument',
      description: 'The document as stored.',
      contract: contextDocumentEnvelopeSchema,
      describe: documentFields('data.'),
      data: personalPreferences,
    }),
    ApiErrors(...SAVE_PROBLEMS),
  );

export const DocListProjectContext = () =>
  applyDecorators(
    ApiRoute(
      'Read the context and preferences of a project',
      "The two documents of one project: `context` (the project's facts and instructions) then `preferences` (how answers should look in this project). Readable on an archived project too. A document that was never written is returned with `revision: 0` and empty content.",
    ),
    ApiIdParam('projectId', 'Identifier of a project the signed-in account owns.', PROJECT_ID),
    ApiEnvelopeResponse({
      name: 'ProjectContextDocuments',
      description: 'Both project documents.',
      contract: contextDocumentSetEnvelopeSchema,
      describe: SET_DESCRIBE,
      data: { maxBytes: 65536, documents: [projectContext, neverWritten('preferences')] },
    }),
    ApiErrors(PROBLEM.unauthenticated, PROBLEM.invalidToken, PROBLEM.notFound('project')),
  );

export const DocSaveProjectContext = () =>
  applyDecorators(
    ApiRoute(
      'Update the context or the preferences of a project',
      `Replaces one document of a project. One route covers both documents; each has its own revision, so updating both is two calls.

Read first (\`GET\` on the same path without the kind) to learn the \`revision\`, write with it as \`expectedRevision\`, keep the returned \`revision\` for the next write. After a network failure, re-read and compare \`contentHash\` before retrying.`,
    ),
    ApiIdParam('projectId', 'Identifier of a project the signed-in account owns.', PROJECT_ID),
    ApiParam({
      name: 'kind',
      description: 'The project document to write.',
      schema: { type: 'string', enum: ['context', 'preferences'], example: 'context' },
    }),
    saveBody('SaveProjectContextDocument', {
      content: '# Projet LISAB\nFaits et consignes du projet.',
      expectedRevision: 7,
    }),
    ApiEnvelopeResponse({
      name: 'SavedProjectContextDocument',
      description: 'The document as stored.',
      contract: contextDocumentEnvelopeSchema,
      describe: documentFields('data.'),
      data: projectContext,
    }),
    ApiErrors(
      ...SAVE_PROBLEMS,
      PROBLEM.notFound('project'),
      {
        status: 409,
        code: 'project_archived',
        message: 'Project is archived.',
        when: 'The project is archived: it can still be read, no longer written.',
      },
      {
        status: 409,
        code: 'project_deleting',
        message: 'Project is being deleted.',
        when: 'The project is being deleted.',
      },
    ),
  );
