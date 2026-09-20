import { ApiHeader } from '@nestjs/swagger';
import type { ApiProblem } from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';

/** Shared by the conversation route documentation: identifiers, samples, fields and errors. */
export const CONVERSATION_ID = '7d3e2b1a-4c5f-4a6b-8c9d-0e1f2a3b4c5d';
export const NAMED_PROJECT_ID = '3f0c6c0e-9c7b-4f2a-9a58-2d5a1c7e8b41';
const IMPLICIT_PROJECT_ID = 'b2a1c0d9-8e7f-4a6b-9c5d-4e3f2a1b0c9d';

export const CONVERSATION_ID_TEXT =
  'Identifier of a chat the signed-in account owns, as returned by `POST /api/conversations` or `GET /api/conversations`.';

/** Descriptions of one conversation, prefixed with where it sits in the answer. */
export const conversationFields = (prefix: string): Record<string, string> => ({
  [`${prefix}id`]:
    'Identifier of the chat. Use it in every `/api/conversations/{id}` route, messages and executions included.',
  [`${prefix}projectId`]:
    'The project the chat belongs to. A standalone chat has a private project of its own (`projectKind: implicit`), created with it and deleted with it.',
  [`${prefix}projectKind`]:
    '`implicit`: a standalone chat, outside any named project. `named`: a chat of a project the user created.',
  [`${prefix}title`]:
    'Display title, one line. `Nouvelle conversation` until the chat is titled by its first message or by the user.',
  [`${prefix}titleSource`]:
    'Who chose the title. `none`: default title, the first message will title the chat. `auto`: derived from the first message. `user`: given at creation or by a rename, never replaced automatically.',
  [`${prefix}pinnedAt`]:
    'When the chat was pinned (UTC); `null` when it is not pinned. Pinned chats come first in lists.',
  [`${prefix}lastActivityAt`]:
    'Last message or answer activity (UTC); `null` for a chat that never received a message.',
  [`${prefix}createdAt`]:
    'Creation time (UTC). Lists are ordered by it, newest first, among pinned chats and then among the others.',
  [`${prefix}updatedAt`]:
    'Last change of the chat (UTC): rename, pin, unpin or new activity. Moving the chat to a project does not change it.',
  [`${prefix}archivedAt`]:
    'When the chat was archived (UTC); `null` for a live chat. Archived chats are left out of lists. No route archives a chat today, so expect `null`.',
});

/** A standalone chat right after `POST /api/conversations` with an empty body. */
export const standaloneChat = {
  archivedAt: null,
  createdAt: '2026-09-18T08:41:07.312Z',
  id: CONVERSATION_ID,
  lastActivityAt: null,
  pinnedAt: null,
  projectId: IMPLICIT_PROJECT_ID,
  projectKind: 'implicit',
  title: 'Nouvelle conversation',
  titleSource: 'none',
  updatedAt: '2026-09-18T08:41:07.312Z',
};

/** A chat of a named project, titled by the user and already used. */
export const projectChat = {
  archivedAt: null,
  createdAt: '2026-09-17T14:02:55.108Z',
  id: '1c9a4e7f-2b3d-4c8e-a1f0-6d5b4c3a2e19',
  lastActivityAt: '2026-09-17T14:20:31.664Z',
  pinnedAt: null,
  projectId: NAMED_PROJECT_ID,
  projectKind: 'named',
  title: 'Analyse des incidents de septembre',
  titleSource: 'user',
  updatedAt: '2026-09-17T14:20:31.664Z',
};

/** A standalone chat titled from its first message, then pinned. */
export const pinnedChat = {
  ...standaloneChat,
  lastActivityAt: '2026-09-18T08:43:12.950Z',
  pinnedAt: '2026-09-18T09:05:44.021Z',
  title: 'Comparer les offres de maintenance',
  titleSource: 'auto',
  updatedAt: '2026-09-18T09:05:44.021Z',
};

/** The route reads `Idempotency-Key`; only `@Idempotent()` handlers do. */
export const ApiIdempotencyKeyHeader = () =>
  ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Makes the call safe to retry. 1 to 128 characters among letters, digits, `_` and `-`, chosen by the caller, unique per intent. The first success is stored for 24 hours per account; the same key with the same path, query string and body replays that stored status and body instead of running again. Without the header, every call runs. Example: `chat-8f2c1d7a-0001`.',
    schema: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9_-]{1,128}$' },
  });

/** Answers of the idempotency layer, the same on every route that reads `Idempotency-Key`. */
export const IDEMPOTENCY_PROBLEMS: readonly ApiProblem[] = [
  {
    status: 400,
    code: 'invalid_idempotency_key',
    message: 'Invalid Idempotency-Key',
    when: '`Idempotency-Key` is empty, longer than 128 characters or holds a character other than letters, digits, `_` and `-`. Nothing ran; fix the key.',
  },
  {
    status: 409,
    code: 'idempotency_in_progress',
    message: 'This request is still in progress or requires reconciliation',
    when: 'The same `Idempotency-Key` is still running after a 2-second wait, or its earlier attempt ended without a stored success (an error other than a validation `400`, or a crash). The key stays reserved for 24 hours: read the resource to learn the outcome, then use a new key.',
  },
  {
    status: 422,
    code: 'idempotency_mismatch',
    message: 'Idempotency-Key was used for a different request',
    when: 'This account already used the `Idempotency-Key` within 24 hours with another path, query string or body. Nothing ran; use a new key for a new intent.',
  },
];

/** `TenantsService.scopeFor`: the token is valid, the account behind it is not usable. */
export const ACCOUNT_UNAVAILABLE: ApiProblem = {
  status: 401,
  code: 'HTTP_401',
  message: 'Account is unavailable',
  when: 'The access token is valid but its account no longer exists or is disabled. Retrying cannot succeed.',
};

export const PRIVATE_ROUTE_PROBLEMS: readonly ApiProblem[] = [
  PROBLEM.unauthenticated,
  PROBLEM.invalidToken,
  ACCOUNT_UNAVAILABLE,
];

/** The 404 of a chat also covers a chat whose project is no longer active. */
export const CONVERSATION_NOT_FOUND: ApiProblem = {
  ...PROBLEM.notFound('conversation'),
  when: 'The chat does not exist, belongs to another account, the identifier is not a UUID, or its project is archived or being deleted. All indistinguishable by design.',
};

/** The two refusals of a project that no longer accepts writes, worded for the route. */
export const projectNotWritable = (when: string): readonly ApiProblem[] => [
  { status: 409, code: 'project_archived', message: 'Project is archived.', when },
  { status: 409, code: 'project_deleting', message: 'Project is being deleted.', when },
];

/** Writes on a chat re-check its project after waiting for the project lock. */
export const PROJECT_CHANGED_WHILE_WAITING = projectNotWritable(
  "The chat's project was archived or started being deleted while this request waited for it. Nothing changed; later calls answer `404`.",
);

export const TARGET_PROJECT_NOT_WRITABLE = projectNotWritable(
  'The project named by `projectId` is archived or being deleted: it accepts no new chat. Choose another project.',
);

export const THREAD_BUSY: ApiProblem = {
  status: 409,
  code: 'thread_busy',
  message: 'Stop the active execution before changing this resource.',
  when: 'An execution of this chat is still advancing: pending, running, stopping, or recovering for less than 30 seconds. Find it with `GET /api/conversations/{id}/executions/active`, stop it with `POST /api/executions/{id}/stop` or wait for it to finish, then retry. An interrupted execution, or one past its deadline, never blocks.',
};

const TITLE_PATTERN_MESSAGE = 'title must match /^[^\\u0000-\\u001f\\u007f]+$/u regular expression';

/** `title` rules shared by creation and rename; one message per broken field is sent. */
export const titleProblems = (missing: string): readonly ApiProblem[] => [
  PROBLEM.validation(
    `\`title\` is ${missing}empty once trimmed, \`null\`, not a string, or holds a control character (tab and line break included).`,
    TITLE_PATTERN_MESSAGE,
  ),
  PROBLEM.validation(
    '`title` is longer than 160 characters once trimmed.',
    'title must be shorter than or equal to 160 characters',
  ),
];

export const TITLE_TEXT =
  'One line of text, 1 to 160 characters once surrounding spaces are trimmed. No control character: no tab, no line break.';
