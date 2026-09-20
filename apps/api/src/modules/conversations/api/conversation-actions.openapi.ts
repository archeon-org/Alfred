import { conversationEnvelopeSchema, moveConversationInputSchema } from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
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
  THREAD_BUSY,
  conversationFields,
  pinnedChat,
  projectNotWritable,
  standaloneChat,
} from './conversations-shared.openapi';

const unpinnedChat = { ...pinnedChat, pinnedAt: null, updatedAt: '2026-09-18T09:12:03.480Z' };
const movedChat = { ...pinnedChat, projectId: NAMED_PROJECT_ID, projectKind: 'named' };

export const DocPinConversation = () =>
  applyDecorators(
    ApiRoute(
      'Pin a chat',
      'Pins a chat so that lists return it before the unpinned ones. No body. Safe to repeat: pinning a chat that is already pinned changes nothing and answers the chat with its first `pinnedAt`. Works for standalone chats and project chats alike; the number of pinned chats is not limited.',
    ),
    ApiIdParam('id', CONVERSATION_ID_TEXT, CONVERSATION_ID),
    ApiEnvelopeResponse({
      name: 'ConversationsPinned',
      description: 'The chat, with `pinnedAt` set.',
      contract: conversationEnvelopeSchema,
      describe: conversationFields('data.'),
      data: pinnedChat,
    }),
    ApiErrors(...PRIVATE_ROUTE_PROBLEMS, CONVERSATION_NOT_FOUND, ...PROJECT_CHANGED_WHILE_WAITING),
  );

export const DocUnpinConversation = () =>
  applyDecorators(
    ApiRoute(
      'Unpin a chat',
      'Removes the pin of a chat: it goes back among the unpinned chats, ordered by creation time. No body. Safe to repeat: unpinning a chat that is not pinned changes nothing and answers it as it is.',
    ),
    ApiIdParam('id', CONVERSATION_ID_TEXT, CONVERSATION_ID),
    ApiEnvelopeResponse({
      name: 'ConversationsUnpinned',
      description: 'The chat, with `pinnedAt: null`.',
      contract: conversationEnvelopeSchema,
      describe: conversationFields('data.'),
      data: unpinnedChat,
    }),
    ApiErrors(...PRIVATE_ROUTE_PROBLEMS, CONVERSATION_NOT_FOUND, ...PROJECT_CHANGED_WHILE_WAITING),
  );

export const DocMoveConversation = () =>
  applyDecorators(
    ApiRoute(
      'Move a standalone chat into a named project',
      `Attaches a standalone chat (\`projectKind: implicit\`) to a named project of the same account. Only the link changes: identifier, title, pin, messages and every timestamp stay as they are, \`updatedAt\` included. The private project the chat had is deleted in the same transaction.

Before calling, make sure that:
- the target is a **named, active** project of the account;
- the chat is **standalone**. A chat that already sits in a named project cannot be moved again, and there is no route to make it standalone again;
- the private project of the chat holds **nothing to lose**: no context or preferences document with content (\`/api/projects/{projectId}/context-documents\`) and no description. Otherwise the move is refused with \`conversation_source_has_context\` and nothing changes: empty them first, or keep the chat where it is. A pinned chat moves with its pin;
- no execution of the chat is still advancing.

Moving a chat to the project it is already in answers \`200\` with the chat unchanged, so a retry is safe even without an \`Idempotency-Key\`. Two concurrent moves to different projects: one wins, the other answers \`409\`.`,
    ),
    ApiIdParam('id', CONVERSATION_ID_TEXT, CONVERSATION_ID),
    ApiIdempotencyKeyHeader(),
    ApiJsonBody({
      name: 'ConversationsMoveBody',
      description: 'The destination project. Required.',
      contract: moveConversationInputSchema,
      describe: {
        projectId:
          'Identifier of the named, active project that receives the chat, as listed by `GET /api/projects`. Upper-case and lower-case hexadecimal digits are the same identifier.',
      },
      examples: {
        move: {
          summary: 'Attach the chat to a named project',
          value: { projectId: NAMED_PROJECT_ID },
        },
        upperCase: {
          summary: 'The same project, written in upper case',
          value: { projectId: NAMED_PROJECT_ID.toUpperCase() },
        },
      },
    }),
    ApiEnvelopeResponse({
      name: 'ConversationsMoved',
      description:
        'The chat in its new project: `projectId` and `projectKind: named` are the only fields that differ from before the move.',
      contract: conversationEnvelopeSchema,
      describe: conversationFields('data.'),
      data: movedChat,
      more: {
        neverUsed: {
          summary: 'A chat moved before its first message',
          data: { ...standaloneChat, projectId: NAMED_PROJECT_ID, projectKind: 'named' },
        },
      },
    }),
    ApiErrors(
      PROBLEM.validation(
        '`projectId` is missing, `null` or not a UUID.',
        'projectId must be a UUID',
      ),
      PROBLEM.unknownField,
      PROBLEM.invalidJson,
      ...PRIVATE_ROUTE_PROBLEMS,
      {
        ...PROBLEM.notFound('conversation'),
        when: 'The chat does not exist, belongs to another account, or the identifier is not a UUID. The three cases are indistinguishable by design.',
      },
      {
        ...PROBLEM.notFound('project'),
        when: 'The project named by `projectId` does not exist or belongs to another account. The two cases are indistinguishable by design.',
      },
      {
        status: 409,
        code: 'conversation_move_not_allowed',
        message: 'Only standalone conversations can be added to a named project.',
        when: 'The chat already belongs to a named project, `projectId` is the private project of a standalone chat, or a concurrent move of the same chat won. Re-read the chat; do not retry as is.',
      },
      {
        status: 409,
        code: 'conversation_source_has_context',
        message: 'The standalone project contains data that must be preserved.',
        when: 'The private project of the chat holds a context or preferences document with content, a description, or anything else the move would discard (a name, a pin of its own, another chat). Nothing changed: empty the documents and the description, then retry.',
      },
      {
        status: 409,
        code: 'conversation_archived',
        message: 'Conversation is archived.',
        when: 'The chat is archived. An archived chat is not moved.',
      },
      THREAD_BUSY,
      ...projectNotWritable(
        'The target project, or the private project of the chat, is archived or being deleted. Nothing changed; choose an active project.',
      ),
      PROBLEM.bodyTooLarge,
      ...IDEMPOTENCY_PROBLEMS,
    ),
  );
