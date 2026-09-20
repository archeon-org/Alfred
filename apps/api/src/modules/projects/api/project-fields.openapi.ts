import { ApiIdParam, type ApiProblem } from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';

/** Shared by every projects route: the examples, the field texts and the recurring error answers. */
export const PROJECT_ID = '3f0c6c0e-9c7b-4f2a-9a58-2d5a1c7e8b41';
const OTHER_PROJECT_ID = '8d2e4b6a-1c3f-4a5b-9e7d-0f1a2b3c4d5e';
const SHELL_PROJECT_ID = 'c5a1e0d4-6b2f-4c8e-a3d7-9f0b1e2c3a4d';

/** Wire messages hold the pattern source, so the backslashes are literal characters. */
export const NAME_PATTERN_MESSAGE =
  'name must match /^[^\\u0000-\\u001f\\u007f]+$/u regular expression';
export const textPatternMessage = (field: 'description' | 'context') =>
  `${field} must match /^[^\\u0000]*$/u regular expression`;

/** Field texts of a project, under `data.` (one project) or `data.items[].` (a page). */
export const projectFields = (prefix: 'data.' | 'data.items[].') => ({
  [`${prefix}id`]:
    'Identifier of the project. Use it in every `/api/projects/{id}` route, in `/api/projects/{projectId}/context-documents`, and as `projectId` to create or list the chats of the project.',
  [`${prefix}kind`]:
    '`named`: a project the user created, the only kind `GET /api/projects` lists. `implicit`: the private shell that holds one standalone chat (the `projectId` of that chat); never listed, it cannot be renamed or pinned.',
  [`${prefix}name`]:
    'Display name: one line of 1 to 160 characters, stored trimmed. Not unique. `null` only on an `implicit` project.',
  [`${prefix}description`]: 'Free text shown with the project; `null` when there is none.',
  [`${prefix}context`]:
    'Read-only copy of the project `context` document, `null` when that document is empty or was never written. It carries no revision: read and write the document itself with `/api/projects/{projectId}/context-documents`.',
  [`${prefix}status`]:
    '`active`: usable. `archived`: still readable and deletable; every change (rename, description, pin, unpin, its documents, a new chat) answers `409 project_archived`. `deleting`: the same, with `409 project_deleting`. Only `active` projects are listed. No route of this API version archives a project or leaves one in `deleting`: `DELETE /api/projects/{id}` removes the project before it answers.',
  [`${prefix}createdAt`]: 'When the project was created (UTC).',
  [`${prefix}updatedAt`]:
    'Last change of the project itself (UTC): a rename, a new description, a pin, an unpin or a write of its `context` document. Lists sort on it, newest first, unless `pinned=true`.',
  [`${prefix}archivedAt`]: 'When the project was archived (UTC); `null` while it is not.',
  [`${prefix}pinnedAt`]:
    'When the owner pinned the project (UTC); `null` when it is not pinned. `GET /api/projects?pinned=true` follows this time, oldest pin first.',
});

/** Keys in the order the API serialises them. */
export const portalProject = {
  archivedAt: null,
  context: null,
  createdAt: '2026-09-18T09:12:44.127Z',
  description: 'Migration du portail client vers la nouvelle charte.',
  id: PROJECT_ID,
  kind: 'named',
  name: 'Refonte du portail',
  pinnedAt: null,
  status: 'active',
  updatedAt: '2026-09-18T09:12:44.127Z',
};

export const portalProjectWithContext = {
  ...portalProject,
  context: '# Portail\nFaits et consignes du projet.',
};

export const pinnedPortalProject = {
  ...portalProjectWithContext,
  pinnedAt: '2026-09-20T16:48:44.945Z',
  updatedAt: '2026-09-20T16:48:44.945Z',
};

export const runbookProject = {
  archivedAt: null,
  context: null,
  createdAt: '2026-09-12T14:30:02.611Z',
  description: null,
  id: OTHER_PROJECT_ID,
  kind: 'named',
  name: 'Runbooks de production',
  pinnedAt: null,
  status: 'active',
  updatedAt: '2026-09-19T08:03:10.482Z',
};

/** What `GET /api/projects/{id}` answers for the `projectId` of a standalone chat. */
export const shellProject = {
  archivedAt: null,
  context: null,
  createdAt: '2026-09-20T10:05:31.208Z',
  description: null,
  id: SHELL_PROJECT_ID,
  kind: 'implicit',
  name: null,
  pinnedAt: null,
  status: 'active',
  updatedAt: '2026-09-20T10:05:31.208Z',
};

/** The cursor the API issues after `runbookProject`: its `updatedAt` in microseconds and its id. */
export const NEXT_CURSOR =
  'eyJzb3J0VmFsdWUiOiIyMDI2LTA5LTE5VDA4OjAzOjEwLjQ4MjE5M1oiLCJpZCI6IjhkMmU0YjZhLTFjM2YtNGE1Yi05ZTdkLTBmMWEyYjNjNGQ1ZSJ9';

export const ProjectIdParam = (description: string) => ApiIdParam('id', description, PROJECT_ID);

/**
 * Every projects route passes the global `AccessTokenGuard`, then its service method resolves the
 * owner scope with `TenantsService.scopeFor`, which refuses a token whose account is gone.
 */
export const PROJECT_AUTH_PROBLEMS: readonly ApiProblem[] = [
  ...PROBLEM.session,
  PROBLEM.accountUnavailable,
];

/** `bootstrap.ts`: `6 * 65_536 + 1024` bytes for every JSON route outside `/api/skills`. */
export const PROJECT_BODY_TOO_LARGE: ApiProblem = {
  ...PROBLEM.bodyTooLarge,
  when: 'The JSON body exceeds 394 240 bytes as sent, JSON escapes included: the room a 65 536-byte `context` needs when every character is escaped. Nothing was read: send a smaller body.',
};

export const PROJECT_NOT_FOUND = PROBLEM.notFound('project');

export const PROJECT_DELETING: ApiProblem = {
  ...PROBLEM.projectDeleting,
  when: 'The project has the `deleting` status: it can still be read and deleted, no longer changed. No route of this API version sets that status.',
};

export const PROJECT_ARCHIVED: ApiProblem = {
  ...PROBLEM.projectArchived,
  when: 'The project is archived: it can still be read and deleted, no longer changed.',
};

/** `action` completes "… cannot be <action>." */
export const projectImplicit = (action: string): ApiProblem => ({
  ...PROBLEM.projectImplicit,
  when: `The identifier names the private shell of a standalone chat (\`kind: implicit\`), which cannot be ${action}. Create a named project and move the chat into it with \`POST /api/conversations/{id}/move\`.`,
});
