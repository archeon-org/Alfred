import {
  createProjectInputSchema,
  projectEnvelopeSchema,
  projectListEnvelopeSchema,
} from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiJsonBody,
  ApiRoute,
} from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';
import {
  NAME_PATTERN_MESSAGE,
  NEXT_CURSOR,
  PROJECT_AUTH_PROBLEMS,
  PROJECT_NOT_FOUND,
  ProjectIdParam,
  pinnedPortalProject,
  portalProject,
  portalProjectWithContext,
  projectFields,
  runbookProject,
  shellProject,
  textPatternMessage,
} from './project-fields.openapi';

export const DocCreateProject = () =>
  applyDecorators(
    ApiRoute(
      'Create a project',
      `Creates a named project owned by the signed-in account and answers it with \`201\`. It starts \`active\` and not pinned. Names are not unique: calling twice creates two projects, unless the call carries an \`Idempotency-Key\`. A refused call creates nothing.

- **Safe retry (optional)**: with an \`Idempotency-Key\` header, the same key and the same request answer the stored \`201\` body again for 24 hours and create nothing. "Same request" means the same URL and the same JSON body as sent (key order is ignored, a difference in whitespace inside \`name\` is not). The same key with another request answers \`422 idempotency_mismatch\`. While the first call is still running, a second one waits up to 2 seconds, then answers \`409 idempotency_in_progress\`.
- **What reserves a key**: only a call that got past the access token check and validation. A refused token, a \`413\` and every \`HTTP_400\` leave the key free, so a corrected body can reuse it. After any other failure (\`invalid_content\`, \`context_content_too_large\`, a \`500\`, a lost connection) the key keeps answering \`409\` until it expires: list the projects to see whether the creation happened, then retry with a new key.
- **\`context\`** is a shortcut for the first write of the project \`context\` document. When the field is sent, even empty, the document is written in the same transaction and starts at revision 1. Every later change goes through \`PUT /api/projects/{projectId}/context-documents/context\`; \`PATCH /api/projects/{id}\` refuses the field.`,
    ),
    ApiHeader({
      name: 'Idempotency-Key',
      required: false,
      description:
        'Makes a retry of this creation safe. 1 to 128 characters among `A-Z`, `a-z`, `0-9`, `_` and `-`. One key per intended creation, reused only to retry that same call; it is scoped to the signed-in account across every route that accepts the header, and kept 24 hours. Without the header nothing is deduplicated. Example: `create-project-7f3a9c2e`.',
      schema: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9_-]{1,128}$' },
    }),
    ApiJsonBody({
      name: 'ProjectsCreateBody',
      description:
        'The new project. Only `name` is required. A field is either sent as a string or omitted: `null` is refused.',
      contract: createProjectInputSchema,
      describe: {
        name: 'Display name. Surrounding whitespace is removed, then it must hold 1 to 160 characters on one line: no control character, line breaks included.',
        description:
          'Free text shown with the project, at most 2000 characters, any character except NUL. `\\r\\n` is stored as `\\n`. Omitted, empty or blank means no description (`null` in the answer).',
        context:
          'Initial Markdown content of the project `context` document: at most 65 536 UTF-8 bytes (less when the deployment lowered its document limit), no NUL character, no unpaired surrogate. `\\r\\n` and `\\r` are stored as `\\n`. An empty string writes an empty document and answers `context: null`.',
      },
      examples: {
        minimal: { summary: 'A name is enough', value: { name: 'Refonte du portail' } },
        described: {
          summary: 'With a description',
          value: {
            name: 'Refonte du portail',
            description: 'Migration du portail client vers la nouvelle charte.',
          },
        },
        withContext: {
          summary: 'With the first version of the project context document',
          value: {
            name: 'Refonte du portail',
            description: 'Migration du portail client vers la nouvelle charte.',
            context: '# Portail\nFaits et consignes du projet.',
          },
        },
      },
    }),
    ApiEnvelopeResponse({
      name: 'ProjectsCreated',
      status: 201,
      description:
        'The project as stored. A replay with the same `Idempotency-Key` answers this same body again.',
      contract: projectEnvelopeSchema,
      describe: projectFields('data.'),
      data: portalProject,
      more: {
        withContext: {
          summary: 'Created with `context`: the field mirrors the document just written',
          data: portalProjectWithContext,
        },
      },
    }),
    ApiErrors(
      PROBLEM.validation(
        '`name` is missing, `null`, not a string, blank once trimmed, or holds a control character (a line break included).',
        NAME_PATTERN_MESSAGE,
      ),
      PROBLEM.validation(
        '`name` exceeds 160 characters once trimmed.',
        'name must be shorter than or equal to 160 characters',
      ),
      PROBLEM.validation(
        '`description` or `context` is `null`, not a string, or holds a NUL character. One message per refused field.',
        textPatternMessage('description'),
        textPatternMessage('context'),
      ),
      PROBLEM.validation(
        '`description` exceeds 2000 characters, or `context` exceeds 65 536 UTF-8 bytes. One message per refused field.',
        'description must be shorter than or equal to 2000 characters',
        'context must not exceed 65536 bytes',
      ),
      PROBLEM.unknownField,
      PROBLEM.invalidJson,
      {
        status: 400,
        code: 'invalid_idempotency_key',
        message: 'Invalid Idempotency-Key',
        when: 'The `Idempotency-Key` header is empty, longer than 128 characters, holds another character than `A-Z a-z 0-9 _ -`, or was sent twice.',
      },
      {
        status: 400,
        code: 'invalid_content',
        message: 'Content must be valid Unicode text without NUL.',
        when: '`context` holds an unpaired surrogate (`\\ud800` to `\\udfff` alone). With an `Idempotency-Key`, the key stays reserved: fix the text and use a new key.',
      },
      {
        status: 400,
        code: 'context_content_too_large',
        message: 'Context document exceeds its byte limit.',
        details: { maxBytes: 32768 },
        when: '`context` fits in 65 536 bytes but exceeds the document limit of this deployment, which was lowered (`data.maxBytes` of `GET /api/projects/{projectId}/context-documents`). `details.maxBytes` holds the limit. With an `Idempotency-Key`, the key stays reserved: shorten the text and use a new key.',
      },
      ...PROJECT_AUTH_PROBLEMS,
      {
        status: 409,
        code: 'idempotency_in_progress',
        message: 'This request is still in progress or requires reconciliation',
        when: 'The `Idempotency-Key` belongs to a call that has not stored a `201` yet: it is still running (the API waited 2 seconds), or it failed after validation. Retry a little later; if it persists, check whether the project exists, then use a new key.',
      },
      PROBLEM.bodyTooLarge,
      {
        status: 422,
        code: 'idempotency_mismatch',
        message: 'Idempotency-Key was used for a different request',
        when: 'The `Idempotency-Key` was already used within 24 hours by this account for another URL or another body. Use a new key for a new creation.',
      },
    ),
  );

export const DocListProjects = () =>
  applyDecorators(
    ApiRoute(
      'List the projects of the signed-in account',
      `The named, \`active\` projects the signed-in account owns. The private shells of standalone chats (\`kind: implicit\`) and projects that are not \`active\` never appear. Read-only.

- **Without \`pinned\`**: every project, pinned or not, most recently updated first (\`updatedAt\`, then \`id\`), paged by cursor.
- **\`pinned=false\`**: the same order and paging, without the pinned projects.
- **\`pinned=true\`**: only the pinned projects, oldest pin first, all of them in one answer (an account pins at most 100). \`limit\` and \`cursor\` are still validated but not used, and \`nextCursor\` is always \`null\`.
- To show pinned projects apart from the recent ones, call the route twice: \`pinned=true\`, then \`pinned=false\`.
- **Paging**: \`limit\` 1 to 100 (default 20). Send \`data.nextCursor\` back unchanged as \`cursor\` with the same \`pinned\` value; \`nextCursor: null\` is the last page. A project changed while you page moves to the front, so a walk in progress can miss it: start again from the first page after a write.`,
    ),
    ApiEnvelopeResponse({
      name: 'ProjectsPage',
      description: 'One page of projects, or every pinned project when `pinned=true`.',
      contract: projectListEnvelopeSchema,
      describe: projectFields('data.items[].'),
      data: { items: [pinnedPortalProject, runbookProject], nextCursor: NEXT_CURSOR },
      more: {
        pinned: {
          summary: '`pinned=true`: the pinned projects in pin order, never a cursor',
          data: { items: [pinnedPortalProject], nextCursor: null },
        },
        empty: {
          summary: 'No project yet, or none matching `pinned`',
          data: { items: [], nextCursor: null },
        },
      },
    }),
    ApiErrors(
      PROBLEM.validation(
        '`pinned` is anything but the exact strings `true` and `false` (`1`, `TRUE`, an empty value and a repeated parameter are refused).',
        'pinned must be a boolean value',
      ),
      PROBLEM.validation(
        '`limit` is not an integer from 1 to 100 written in digits (`limit=0` answers `limit must not be less than 1`, anything else the message below), or `cursor` exceeds 512 characters. One message per refused parameter.',
        'cursor must be shorter than or equal to 512 characters',
        'limit must not be greater than 100',
      ),
      PROBLEM.unknownField,
      {
        ...PROBLEM.invalidCursor,
        when: 'The `cursor` was not produced by this route or was altered. Not checked when `pinned=true`, which ignores the cursor. Start again without `cursor`.',
      },
      ...PROJECT_AUTH_PROBLEMS,
    ),
  );

export const DocGetProject = () =>
  applyDecorators(
    ApiRoute(
      'Read a project',
      'One project of the signed-in account, by identifier. Unlike the list, it also answers a project that is `archived` or `deleting`, and the `implicit` shell of a standalone chat (the `projectId` of that chat). Read-only.',
    ),
    ProjectIdParam(
      'Identifier of a project the signed-in account owns: an `id` of `GET /api/projects`, or the `projectId` of one of its chats.',
    ),
    ApiEnvelopeResponse({
      name: 'ProjectsDetail',
      description: 'The project.',
      contract: projectEnvelopeSchema,
      describe: projectFields('data.'),
      data: pinnedPortalProject,
      more: {
        shell: {
          summary: 'The private shell of a standalone chat: `kind: implicit`, no name',
          data: shellProject,
        },
      },
    }),
    ApiErrors(...PROJECT_AUTH_PROBLEMS, PROJECT_NOT_FOUND),
  );
