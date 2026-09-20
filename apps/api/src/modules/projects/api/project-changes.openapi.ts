import { projectEnvelopeSchema, updateProjectInputSchema } from '@alfred/contracts';
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
  NAME_PATTERN_MESSAGE,
  PROJECT_ARCHIVED,
  PROJECT_AUTH_PROBLEMS,
  PROJECT_DELETING,
  PROJECT_NOT_FOUND,
  ProjectIdParam,
  pinnedPortalProject,
  portalProjectWithContext,
  projectFields,
  projectImplicit,
  textPatternMessage,
} from './project-fields.openapi';

const OWNED_PROJECT = 'Identifier of a project the signed-in account owns.';

export const DocUpdateProject = () =>
  applyDecorators(
    ApiRoute(
      'Rename a project or change its description',
      `Changes the name, the description, or both, and answers the project as stored. Send only the fields to change: an omitted field keeps its value. There is no concurrency token here: the last write wins.

- An empty body answers \`400 invalid_update\`.
- \`null\` never clears a field, it answers \`400\`. Clear the description with an empty string.
- **\`context\` cannot be written here.** The field is still accepted by validation so that an older client gets a clear answer: any valid \`context\`, even unchanged, answers \`409 context_revision_required\`, before the project is looked up and without applying the other fields. Write the document with \`PUT /api/projects/{projectId}/context-documents/context\` and its \`expectedRevision\`; the \`context\` field of the answers follows.
- On the \`implicit\` shell of a standalone chat the description can be changed, the name cannot (\`409 project_implicit\`).
- An \`archived\` or \`deleting\` project refuses every change with a \`409\`.`,
    ),
    ProjectIdParam(OWNED_PROJECT),
    ApiJsonBody({
      name: 'ProjectsUpdateBody',
      description:
        'The fields to change, at least one. A field is either sent as a string or omitted: `null` is refused.',
      contract: updateProjectInputSchema,
      describe: {
        name: 'New display name. Surrounding whitespace is removed, then it must hold 1 to 160 characters on one line: no control character, line breaks included.',
        description:
          'New description, at most 2000 characters, any character except NUL. `\\r\\n` is stored as `\\n`. An empty or blank string removes the description (`null` in the answer).',
        context:
          'Do not send it. Kept for older clients only: a valid value is always refused with `409 context_revision_required`, an invalid one (`null`, not a string, a NUL character, more than 65 536 UTF-8 bytes) with `400`.',
      },
      examples: {
        rename: { summary: 'Rename the project', value: { name: 'Portail v2' } },
        describe: {
          summary: 'Change the description only',
          value: { description: 'Portail client, lot 2 : espace documentaire.' },
        },
        clearDescription: { summary: 'Remove the description', value: { description: '' } },
      },
    }),
    ApiEnvelopeResponse({
      name: 'ProjectsUpdated',
      description: 'The project as stored after the change, with a new `updatedAt`.',
      contract: projectEnvelopeSchema,
      describe: projectFields('data.'),
      data: {
        ...portalProjectWithContext,
        name: 'Portail v2',
        updatedAt: '2026-09-20T16:52:07.318Z',
      },
      more: {
        descriptionRemoved: {
          summary: 'After `{ "description": "" }`',
          data: {
            ...portalProjectWithContext,
            description: null,
            updatedAt: '2026-09-20T16:52:07.318Z',
          },
        },
      },
    }),
    ApiErrors(
      PROBLEM.validation(
        '`name` is `null`, not a string, blank once trimmed, or holds a control character (a line break included).',
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
        code: 'invalid_update',
        message: 'At least one field must be provided.',
        when: 'The body is an empty object: there is nothing to change.',
      },
      ...PROJECT_AUTH_PROBLEMS,
      PROJECT_NOT_FOUND,
      {
        status: 409,
        code: 'context_revision_required',
        message: 'Use the versioned context documents endpoint to update context.',
        when: 'The body carries `context`. Nothing was changed, the other fields included. Remove the field and write the document with `PUT /api/projects/{projectId}/context-documents/context`.',
      },
      PROJECT_DELETING,
      PROJECT_ARCHIVED,
      projectImplicit('renamed'),
      PROBLEM.bodyTooLarge,
    ),
  );

export const DocPinProject = () =>
  applyDecorators(
    ApiRoute(
      'Pin a project',
      `Pins a named project, so that \`GET /api/projects?pinned=true\` lists it, and answers the project. No request body.

- **Repeatable**: pinning a project that is already pinned changes nothing and answers it with its original \`pinnedAt\`, so its place in the pinned list does not move.
- **Limit**: an account holds at most 100 pinned projects, because the pinned list is served in one answer. The pin that would exceed it answers \`409 project_pin_limit_reached\`: unpin another project first. Pins of one account are serialised, so concurrent calls cannot pass the limit together.
- A new pin also sets \`updatedAt\`, which moves the project to the front of the unfiltered list.`,
    ),
    ProjectIdParam(OWNED_PROJECT),
    ApiEnvelopeResponse({
      name: 'ProjectsPinned',
      description: 'The project, pinned: `pinnedAt` holds the time of its first pin.',
      contract: projectEnvelopeSchema,
      describe: projectFields('data.'),
      data: pinnedPortalProject,
    }),
    ApiErrors(
      ...PROJECT_AUTH_PROBLEMS,
      PROJECT_NOT_FOUND,
      PROJECT_DELETING,
      PROJECT_ARCHIVED,
      projectImplicit('pinned'),
      {
        status: 409,
        code: 'project_pin_limit_reached',
        message: 'At most 100 projects can be pinned.',
        when: 'The account already holds 100 pinned projects and this one is not among them. Unpin one with `POST /api/projects/{id}/unpin`, then retry.',
      },
    ),
  );

export const DocUnpinProject = () =>
  applyDecorators(
    ApiRoute(
      'Unpin a project',
      'Removes the pin of a named project and answers the project with `pinnedAt: null`. No request body. Unpinning a project that is not pinned changes nothing and answers it as it is, so the call can be repeated. Pinning it again later gives it a new `pinnedAt`, at the end of the pinned list. A removed pin also sets `updatedAt`.',
    ),
    ProjectIdParam(OWNED_PROJECT),
    ApiEnvelopeResponse({
      name: 'ProjectsUnpinned',
      description: 'The project, not pinned.',
      contract: projectEnvelopeSchema,
      describe: projectFields('data.'),
      data: {
        ...portalProjectWithContext,
        updatedAt: '2026-09-20T17:20:15.602Z',
      },
    }),
    ApiErrors(
      ...PROJECT_AUTH_PROBLEMS,
      PROJECT_NOT_FOUND,
      PROJECT_DELETING,
      PROJECT_ARCHIVED,
      projectImplicit('pinned or unpinned'),
    ),
  );

export const DocDeleteProject = () =>
  applyDecorators(
    ApiRoute(
      'Delete a project and everything in it',
      `Deletes the project for good and answers \`204\` with no body. There is no trash and no undo.

- **What goes with it**: every chat of the project with its messages and executions, and the \`context\` and \`preferences\` documents of the project.
- **Guard**: the deletion is refused with \`409 thread_busy\` while an execution of one of its chats is still advancing: \`pending\`, \`running\` or \`stopping\` before its deadline, or \`recovering\` for less than 30 seconds. Stop it with \`POST /api/executions/{id}/stop\`, or wait for it to end, then retry. An execution that is parked (\`interrupted\`, \`recovery_required\`) or past its deadline does not block. Nothing is deleted when the guard refuses.
- It also deletes an \`archived\` project, and the \`implicit\` shell of a standalone chat together with that chat.
- A second call answers \`404\`: the project no longer exists.`,
    ),
    ProjectIdParam(OWNED_PROJECT),
    ApiResponse({ status: 204, description: 'Deleted. The answer has no body.' }),
    ApiErrors(...PROJECT_AUTH_PROBLEMS, PROJECT_NOT_FOUND, {
      status: 409,
      code: 'thread_busy',
      message: 'Stop the active execution before changing this resource.',
      when: 'A chat of the project has an execution that is still advancing. Nothing was deleted. Stop the execution or wait for it to end, then retry.',
    }),
  );
