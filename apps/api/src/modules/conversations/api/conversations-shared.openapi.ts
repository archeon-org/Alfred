import type { ApiProblem } from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';

/** Shared by the conversation route documentation: identifiers, samples, fields and errors. */
export const CONVERSATION_ID = '7d3e2b1a-4c5f-4a6b-8c9d-0e1f2a3b4c5d';
export const NAMED_PROJECT_ID = '3f0c6c0e-9c7b-4f2a-9a58-2d5a1c7e8b41';
const IMPLICIT_PROJECT_ID = 'b2a1c0d9-8e7f-4a6b-9c5d-4e3f2a1b0c9d';

/** The documentation says "chat"; paths, error codes and error messages say "conversation". */
export const CHAT_IS_CONVERSATION =
  'A chat is the `conversation` of the paths, the error codes and the error messages: one resource, two words.';

export const CONVERSATION_ID_TEXT =
  'Identifier of a chat (a `conversation` in paths and error codes) the signed-in account owns, as returned by `POST /api/conversations` or `GET /api/conversations`.';

/**
 * Descriptions of one conversation, prefixed with where it sits in the answer: `data.` here,
 * `data.snapshot.conversation.` in an execution answer.
 */
export const conversationFields = (prefix: string): Record<string, string> => ({
  [`${prefix}id`]:
    'Identifier of the chat. Use it in every `/api/conversations/{id}` route, messages and executions included.',
  [`${prefix}projectId`]:
    'The project the chat belongs to. A standalone chat has a private project of its own (`projectKind: implicit`), created with it and deleted with it.',
  [`${prefix}projectKind`]:
    '`implicit`: a standalone chat, outside any named project. `named`: a chat of a project the user created.',
  [`${prefix}title`]:
    'Display title, one line, at most 160 characters. `Nouvelle conversation` until the first message or the user titles the chat. While `titleSource` is `auto` the title is provisional and can still be replaced by a generated one.',
  [`${prefix}titleSource`]:
    'Who chose the title. `none`: default title; the first message that has text will title the chat. `auto`: set by the API in two steps. When the first message is sent, the title is its first line, cut to 80 characters (the cut ends with `…`). A few seconds later, possibly after the answer finished, a generated title replaces it, when the deployment generates titles and the result is usable; otherwise the first line stays. Do not cache an `auto` title: re-read the chat or the list after an execution. `user`: given at creation or by a rename, never replaced automatically.',
  [`${prefix}pinnedAt`]:
    'When the chat was pinned (UTC); `null` when it is not pinned. Pinned chats come first in lists.',
  [`${prefix}lastActivityAt`]:
    'Last message or answer activity (UTC); `null` for a chat that never received a message.',
  [`${prefix}createdAt`]:
    'Creation time (UTC). Lists are ordered by it, newest first, among pinned chats and then among the others.',
  [`${prefix}updatedAt`]:
    'Last change of the chat (UTC): rename, pin, unpin, new activity or an automatic title. Moving the chat to a project does not change it.',
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

/** The 404 of a chat also covers a chat whose project is no longer active. */
export const CONVERSATION_NOT_FOUND: ApiProblem = {
  ...PROBLEM.notFound('conversation'),
  when: 'The chat does not exist, belongs to another account, the identifier is not a UUID, or its project is archived or being deleted. All indistinguishable by design.',
};

/**
 * `lockOwned` finds the chat, then waits for the lock of its project row. When the winner of that
 * wait deleted the project, the row is gone and the write answers the project's 404, not the chat's.
 */
export const PROJECT_DELETED_WHILE_WAITING: ApiProblem = {
  ...PROBLEM.notFound('project'),
  when: "The chat's project was deleted while this request waited for it: a concurrent move of the chat, a concurrent delete of the same standalone chat, or a concurrent `DELETE /api/projects/{id}` won. Nothing changed; re-read the chat (after a delete, treat it as already deleted).",
};

/** The two refusals of a project that no longer accepts writes, worded for the route. */
export const projectNotWritable = (when: string): readonly ApiProblem[] => [
  { ...PROBLEM.projectArchived, when },
  { ...PROBLEM.projectDeleting, when },
];

/** Writes on a chat re-check its project after waiting for the project lock. */
export const PROJECT_CHANGED_WHILE_WAITING = projectNotWritable(
  "The chat's project was archived or started being deleted while this request waited for it. Nothing changed; later calls answer `404`.",
);

export const TARGET_PROJECT_NOT_WRITABLE = projectNotWritable(
  'The project named by `projectId` is archived or being deleted: it accepts no new chat. Choose another project.',
);

/** The shared `thread_busy`, with how a caller finds and stops the execution of a chat. */
export const THREAD_BUSY: ApiProblem = {
  ...PROBLEM.threadBusy,
  when: 'An execution of this chat is still advancing: `pending`, `running`, `stopping`, or `recovering` for less than 30 seconds. Read it with `GET /api/conversations/{id}/executions/active` (`{id}` is the chat), then wait for it, or stop it with `POST /api/executions/{id}/stop`, where `{id}` is `data.snapshot.execution.id` of that answer, not the chat. Stopping is asynchronous: the execution stays `stopping`, which still blocks, until a worker settles it. Poll `GET /api/executions/{id}` until its `status` is no longer `stopping` (normally `cancelled`), then retry. An `interrupted` or `recovery_required` execution, or one past its deadline, never blocks.',
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
