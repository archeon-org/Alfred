import {
  conversationEnvelopeSchema,
  conversationListEnvelopeSchema,
  createConversationInputSchema,
  updateConversationInputSchema,
} from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiIdParam,
  ApiJsonBody,
  ApiRoute,
} from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';
import {
  ApiIdempotencyKeyHeader,
  CONVERSATION_ID,
  CONVERSATION_ID_TEXT,
  CONVERSATION_NOT_FOUND,
  IDEMPOTENCY_PROBLEMS,
  NAMED_PROJECT_ID,
  PRIVATE_ROUTE_PROBLEMS,
  PROJECT_CHANGED_WHILE_WAITING,
  TARGET_PROJECT_NOT_WRITABLE,
  THREAD_BUSY,
  TITLE_TEXT,
  conversationFields,
  pinnedChat,
  projectChat,
  standaloneChat,
  titleProblems,
} from './conversations-shared.openapi';

export const DocCreateConversation = () =>
  applyDecorators(
    ApiRoute(
      'Create a chat',
      `Creates an empty chat and answers \`201\` with it. Send messages afterwards with \`POST /api/conversations/{id}/executions\`.

- **Without \`projectId\`** the chat is standalone: the API creates a private project for it in the same transaction (\`projectKind: implicit\`). That project is never chosen by the caller, and is deleted with the chat.
- **With \`projectId\`** the chat is created inside that named project, which must be active.
- Without \`title\` the chat is called \`Nouvelle conversation\` (\`titleSource: none\`) and its first message titles it. A given \`title\` is kept as is (\`titleSource: user\`).
- An empty JSON object is a valid body.
- Send an \`Idempotency-Key\` to make a retry after a network failure safe: without it, a retry creates a second chat.`,
    ),
    ApiIdempotencyKeyHeader(),
    ApiJsonBody({
      name: 'ConversationsCreateBody',
      description:
        'Where to create the chat and, optionally, its title. Both fields can be omitted; neither accepts `null`.',
      contract: createConversationInputSchema,
      describe: {
        projectId:
          'Identifier of a named, active project the signed-in account owns. Omit it for a standalone chat.',
        title: `${TITLE_TEXT} Omit it to let the first message title the chat.`,
      },
      examples: {
        standalone: { summary: 'Standalone chat, titled later by its first message', value: {} },
        inProject: {
          summary: 'Chat inside a named project, titled by the user',
          value: { projectId: NAMED_PROJECT_ID, title: 'Analyse des incidents de septembre' },
        },
      },
    }),
    ApiEnvelopeResponse({
      name: 'ConversationsCreated',
      status: 201,
      description:
        'The chat as created. With an `Idempotency-Key` already used for the same request, the chat created the first time.',
      contract: conversationEnvelopeSchema,
      describe: conversationFields('data.'),
      data: standaloneChat,
      more: {
        inProject: {
          summary: 'Chat created inside a named project with a title',
          data: { ...projectChat, lastActivityAt: null, updatedAt: projectChat.createdAt },
        },
      },
    }),
    ApiErrors(
      PROBLEM.validation(
        '`projectId` is not a UUID. `null` is refused too: omit the field instead.',
        'projectId must be a UUID',
      ),
      ...titleProblems(''),
      PROBLEM.unknownField,
      PROBLEM.invalidJson,
      ...PRIVATE_ROUTE_PROBLEMS,
      {
        ...PROBLEM.notFound('project'),
        when: 'The project named by `projectId` does not exist or belongs to another account. The two cases are indistinguishable by design.',
      },
      ...TARGET_PROJECT_NOT_WRITABLE,
      {
        status: 409,
        code: 'project_implicit',
        message: 'Convert the chat into a project before using it as one.',
        when: '`projectId` is the private project of a standalone chat. It holds one chat only; create the chat in a named project.',
      },
      PROBLEM.bodyTooLarge,
      ...IDEMPOTENCY_PROBLEMS,
    ),
  );

export const DocListConversations = () =>
  applyDecorators(
    ApiRoute(
      'List chats',
      `The chats of the signed-in account, standalone chats and project chats together unless a filter narrows them.

- **Order**: pinned chats first, then newest creation first; stable across pages. The time of pinning does not order pinned chats.
- **Page size**: \`limit\` defaults to **10** on this route (1 to 100).
- \`projectId\` keeps the chats of one project; \`projectKind=implicit\` keeps standalone chats, \`projectKind=named\` chats of named projects. Both filters combine with AND.
- Left out: archived chats, and every chat of a project that is archived or being deleted. Filtering on such a project answers an empty page, not an error.
- Pinning or unpinning a chat moves it in the list: reload from the first page afterwards rather than continuing with an older cursor.`,
    ),
    ApiEnvelopeResponse({
      name: 'ConversationsList',
      description: 'One page of chats.',
      contract: conversationListEnvelopeSchema,
      describe: conversationFields('data.items[].'),
      data: {
        items: [pinnedChat, projectChat],
        nextCursor:
          'eyJpZCI6IjFjOWE0ZTdmLTJiM2QtNGM4ZS1hMWYwLTZkNWI0YzNhMmUxOSIsInNvcnRWYWx1ZSI6IjB8MjAyNi0wOS0xN1QxNDowMjo1NS4xMDgyMTNaIn0',
      },
      more: {
        lastPage: {
          summary: 'Last page: `nextCursor` is `null`',
          data: { items: [projectChat], nextCursor: null },
        },
        empty: {
          summary: 'No chat yet, no match for the filters, or a project that is no longer active',
          data: { items: [], nextCursor: null },
        },
      },
    }),
    ApiErrors(
      PROBLEM.validation('`limit` is below 1.', 'limit must not be less than 1'),
      PROBLEM.validation(
        '`limit` is above 100 or is not a whole number.',
        'limit must not be greater than 100',
      ),
      PROBLEM.validation(
        '`projectKind` is neither `implicit` nor `named`.',
        'projectKind must be one of the following values: implicit, named',
      ),
      PROBLEM.validation(
        '`projectId` is not a UUID. As a query parameter it is validated, unlike a path identifier.',
        'projectId must be a UUID',
      ),
      PROBLEM.validation(
        '`cursor` is longer than 512 characters.',
        'cursor must be shorter than or equal to 512 characters',
      ),
      PROBLEM.unknownField,
      PROBLEM.invalidCursor,
      ...PRIVATE_ROUTE_PROBLEMS,
      {
        ...PROBLEM.notFound('project'),
        when: 'The `projectId` filter names a project that does not exist or belongs to another account. The two cases are indistinguishable by design.',
      },
    ),
  );

export const DocGetConversation = () =>
  applyDecorators(
    ApiRoute(
      'Read a chat',
      'The metadata of one chat: its project, title and pin state. Messages are read with `GET /api/conversations/{id}/messages`. A chat whose project is archived or being deleted answers `404`, like a chat that does not exist.',
    ),
    ApiIdParam('id', CONVERSATION_ID_TEXT, CONVERSATION_ID),
    ApiEnvelopeResponse({
      name: 'ConversationsDetail',
      description: 'The chat.',
      contract: conversationEnvelopeSchema,
      describe: conversationFields('data.'),
      data: projectChat,
      more: {
        standalonePinned: {
          summary: 'Pinned standalone chat, titled from its first message',
          data: pinnedChat,
        },
      },
    }),
    ApiErrors(...PRIVATE_ROUTE_PROBLEMS, CONVERSATION_NOT_FOUND),
  );

export const DocUpdateConversation = () =>
  applyDecorators(
    ApiRoute(
      'Rename a chat',
      'Replaces the title of a chat and marks it as chosen by the user (`titleSource: user`): from then on no automatic title replaces it. `title` is the only field that can be changed here; pin state has its own routes and the project is changed with `POST /api/conversations/{id}/move`. There is no concurrency token: the last rename wins.',
    ),
    ApiIdParam('id', CONVERSATION_ID_TEXT, CONVERSATION_ID),
    ApiJsonBody({
      name: 'ConversationsRenameBody',
      description: 'The new title. Required.',
      contract: updateConversationInputSchema,
      describe: { title: `${TITLE_TEXT} Stored trimmed.` },
      examples: {
        rename: {
          summary: 'Give the chat a title',
          value: { title: 'Analyse des incidents de septembre' },
        },
        trimmed: {
          summary: 'Surrounding spaces are removed: stored as `Décision`',
          value: { title: '  Décision  ' },
        },
      },
    }),
    ApiEnvelopeResponse({
      name: 'ConversationsRenamed',
      description: 'The chat with its new title, `titleSource: user` and a new `updatedAt`.',
      contract: conversationEnvelopeSchema,
      describe: conversationFields('data.'),
      data: projectChat,
    }),
    ApiErrors(
      ...titleProblems('missing, '),
      PROBLEM.unknownField,
      PROBLEM.invalidJson,
      ...PRIVATE_ROUTE_PROBLEMS,
      CONVERSATION_NOT_FOUND,
      ...PROJECT_CHANGED_WHILE_WAITING,
      PROBLEM.bodyTooLarge,
    ),
  );

export const DocDeleteConversation = () =>
  applyDecorators(
    ApiRoute(
      'Delete a chat',
      'Deletes a chat for good, with its messages and its executions. Deleting a standalone chat also deletes the private project that existed for it, once no chat remains in it. Refused while an execution of the chat is still advancing: stop it first. There is no undo; deleting again answers `404`.',
    ),
    ApiIdParam('id', CONVERSATION_ID_TEXT, CONVERSATION_ID),
    ApiResponse({ status: 204, description: 'The chat is deleted. No body.' }),
    ApiErrors(
      ...PRIVATE_ROUTE_PROBLEMS,
      CONVERSATION_NOT_FOUND,
      THREAD_BUSY,
      ...PROJECT_CHANGED_WHILE_WAITING,
    ),
  );
