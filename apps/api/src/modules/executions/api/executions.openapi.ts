import {
  activeExecutionEnvelopeSchema,
  executionSnapshotEnvelopeSchema,
  messageListEnvelopeSchema,
  startExecutionInputSchema,
} from '@alfred/contracts';
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
  CONVERSATION_ID,
  CONVERSATION_ID_TEXT,
  CONVERSATION_NOT_FOUND,
} from '../../conversations/api/conversations-shared.openapi';
import {
  attachment,
  attachmentFields,
  attachmentsOnlySnapshot,
  BINDING_CHANGED,
  completedSnapshot,
  EXECUTION_ID,
  EXECUTION_PRIVATE_PROBLEMS,
  FILE_ID,
  pendingSnapshot,
  projectNotWritable,
  RECOVERY_REQUIRED,
  runningSnapshot,
  snapshotFields,
} from './execution-snapshot.openapi';

const CONVERSATION_PARAM = ApiIdParam('id', CONVERSATION_ID_TEXT, CONVERSATION_ID);

const PRIVATE = EXECUTION_PRIVATE_PROBLEMS;

const userMessage = {
  id: '5d3a9f10-7b2c-4e8d-a1f6-0c9b8e7d6a5f',
  conversationId: CONVERSATION_ID,
  executionId: EXECUTION_ID,
  role: 'user',
  content: 'Rédige un plan de reprise pour la base clients.',
  createdAt: '2026-09-20T16:48:44.120Z',
};
/** Written by the commit that finished the execution, hence right after its `finishedAt`. */
const assistantMessage = {
  id: 'e4c1b7a2-6d5f-4a3e-9b8c-2f1e0d9c8b7a',
  conversationId: CONVERSATION_ID,
  executionId: EXECUTION_ID,
  role: 'assistant',
  content: completedSnapshot.assistantText,
  createdAt: '2026-09-20T16:48:52.909Z',
  work: {
    status: 'completed',
    durationMs: 8509,
    steps: 4,
    tools: 1,
    delegations: 1,
    failedSteps: 0,
  },
};

export const DocListMessages = () =>
  applyDecorators(
    ApiRoute(
      'Read the transcript of a conversation',
      `The visible turns of one conversation, oldest first: what the user sent and what Alfred answered. This is the durable history; it stays readable whatever happened to the executions behind it.

- Not paginated: the **500 most recent** messages are returned, no cursor, no query parameter.
- One \`user\` row per submitted message, and at most one \`assistant\` row per execution. The assistant row is written by the commit that finishes the execution (\`completed\`, \`failed\`, \`cancelled\`, \`timed_out\`), with the visible text it has then; an execution that finishes without visible text gets none. While an execution is active its answer is therefore **not** in this list: read it from \`GET /api/conversations/{id}/executions/active\` or the event stream, and read this list once the execution has settled. An execution that was parked, or replaced by a newer message (\`superseded\`), leaves no assistant row; its partial answer stays readable with \`GET /api/executions/{id}\`.
- \`work\` summarises the work behind an answer without its log; \`attachments\` names the files a user message carried (only while the \`fileUploads\` capability is on).`,
    ),
    CONVERSATION_PARAM,
    ApiEnvelopeResponse({
      name: 'ExecutionsConversationMessages',
      description: 'The transcript, oldest message first.',
      contract: messageListEnvelopeSchema,
      describe: {
        'data.items': 'The 500 most recent messages, oldest first. Empty for a new conversation.',
        'data.items[].id': 'Identifier of the message.',
        'data.items[].conversationId': 'The conversation the message belongs to.',
        'data.items[].executionId':
          'The execution the message belongs to: the one a `user` message started, or the one that wrote an `assistant` message. `null` when the row is linked to none.',
        'data.items[].role': '`user` for a submitted message, `assistant` for an answer.',
        'data.items[].content':
          'Text of the turn: what the user sent, or the visible answer. Empty for a user message of files only.',
        'data.items[].createdAt': 'When the row was first saved (UTC).',
        'data.items[].work':
          'Compact account of the work behind the answer. On `assistant` rows written by an execution only.',
        'data.items[].work.status':
          'Status of the execution now. Anything but `completed`, `failed`, `cancelled` or `timed_out` means the answer can still change.',
        'data.items[].work.durationMs':
          'Milliseconds between the start and the end of the work; `null` while either is unknown.',
        'data.items[].work.steps':
          'Size of the work log as counted in the database, omitted steps included. An upper bound of what `work.steps` of the snapshot shows: it also counts entries the log leaves out, such as the answer itself.',
        'data.items[].work.tools': 'Tool calls among them.',
        'data.items[].work.delegations': 'Tasks handed to a specialist among them.',
        'data.items[].work.failedSteps':
          "Tool calls and delegations the runtime reported as failed, plus a specialist's calls cut short when its delegation ended. A step that was still running when the execution settled (Stop, deadline, failure) is NOT counted here, although `work.steps` of the snapshot reports it `interrupted`.",
        ...attachmentFields('data.items[].attachments'),
      },
      data: { items: [userMessage, assistantMessage] },
      more: {
        attachments: {
          summary: 'A message sent with a file, not answered yet',
          data: {
            items: [
              {
                ...userMessage,
                content: '',
                attachments: [{ ...attachment, delivery: 'text', truncated: true }],
              },
            ],
          },
        },
        empty: { summary: 'A conversation nobody wrote in yet', data: { items: [] } },
      },
    }),
    ApiErrors(...PRIVATE, CONVERSATION_NOT_FOUND, PROBLEM.featureDisabled('agentRuntime')),
  );

export const DocGetActiveExecution = () =>
  applyDecorators(
    ApiRoute(
      'Find the execution a conversation is waiting for',
      `What a client calls when it opens or reloads a conversation: is an answer still in progress? \`snapshot\` is \`null\` when nothing is, otherwise the current snapshot of the active execution, from which the client resumes observation (\`GET /api/executions/{id}/events\` with \`snapshot.cursor\` as \`Last-Event-ID\`).

Active means a non-terminal status and no \`finishedAt\`: \`pending\`, \`running\`, \`recovering\`, \`stopping\`, and the parked states \`interrupted\` and \`recovery_required\`. A parked execution is reported here although a new message may replace it.`,
    ),
    CONVERSATION_PARAM,
    ApiEnvelopeResponse({
      name: 'ExecutionsActiveExecution',
      description: 'The active execution of the conversation, or `null`.',
      contract: activeExecutionEnvelopeSchema,
      describe: {
        ...snapshotFields('data.snapshot'),
        'data.snapshot':
          '`null` when no execution of the conversation is active. Otherwise its cumulative public state, read from one committed revision.',
      },
      data: { snapshot: runningSnapshot },
      more: { idle: { summary: 'Nothing in progress', data: { snapshot: null } } },
    }),
    ApiErrors(
      ...PRIVATE,
      CONVERSATION_NOT_FOUND,
      PROBLEM.featureDisabled('agentRuntime'),
      BINDING_CHANGED,
      RECOVERY_REQUIRED,
    ),
  );

const MESSAGE = 'Rédige un plan de reprise pour la base clients.';

export const DocStartExecution = () =>
  applyDecorators(
    ApiRoute(
      'Send a message and start the execution that answers it',
      `Saves the user message and the intent to answer it in one transaction, then returns at once: the runtime is reached by a background worker, never by this request. The answer is normally a \`pending\` snapshot; follow the work with \`GET /api/executions/{id}/events\` (or poll \`GET /api/executions/{id}\`). Closing the connection never cancels anything; only \`POST /api/executions/{id}/stop\` does.

**Accept header.** Send exactly \`Accept: application/json\` or \`Accept: application/vnd.alfred.execution+json;version=1\`. Anything else, including a missing header, \`*/*\` or a list of types, answers \`406\`. The answer is the same JSON body, sent as \`Content-Type: application/json\`, in both cases.

**Idempotency.** \`submissionId\` is a UUID the client generates per send. Repeating the same request (same conversation, text and attachments in the same order) returns the execution created the first time, in its current state, and starts nothing; do this after a timeout or a network failure. The same \`submissionId\` with different content answers \`409 idempotency_conflict\`.

**One answer at a time.** A conversation that is being answered refuses a new message with \`409 thread_busy\`: stop the active execution first, or wait. An execution that no longer advances is replaced instead, and becomes \`cancelled\` with \`errorCode: superseded\`: one that is parked (\`interrupted\`, \`recovery_required\`), one past its deadline, or one that is \`recovering\` and whose worker recorded nothing for 30 seconds. That delay runs from the last write of the worker, not from the moment the execution entered \`recovering\`: every retry and every progress commit renews it, so a \`recovering\` execution can keep answering \`thread_busy\` for minutes.

**Limits and side effects.** Text up to 16 384 characters after trimming; up to 8 attachments, 4 of them images, each a \`ready\` file of the caller's library (needs the \`fileUploads\` capability). 4 active executions per account and 64 per deployment by default. An execution that has not settled after its deadline (10 minutes by default) becomes \`timed_out\`. The first message of an untitled conversation sets its title to the first line of the text (80 characters at most).`,
    ),
    CONVERSATION_PARAM,
    ApiJsonBody({
      name: 'ExecutionsStartExecution',
      description: 'The message to send. Text, files of the library, or both.',
      contract: startExecutionInputSchema,
      describe: {
        message:
          'The text of the message. Trimmed, `\\r\\n` stored as `\\n`; 16 384 characters at most. Required as a string even with attachments, where it may be empty.',
        submissionId:
          'Idempotency key: a UUID generated by the client for this send and reused unchanged on every retry of it. Unique per conversation.',
        attachmentIds:
          'Identifiers of files of the personal library (`/api/files`) to send with the message, in order, without duplicates; 8 at most. Omit the field when there is none.',
      },
      examples: {
        text: {
          summary: 'A text message',
          value: { submissionId: '2f1c6d0e-5a57-4b52-9d0a-0f3b6a1c9e11', message: MESSAGE },
        },
        withFiles: {
          summary: 'A question about an attached file',
          value: {
            submissionId: '6a0e4c1b-8d2f-4b7a-9e3c-5f1d0a9b8c7e',
            message: 'Résume ce document en cinq points.',
            attachmentIds: [FILE_ID],
          },
        },
        filesOnly: {
          summary: 'Files without text: `message` is present and empty',
          value: {
            submissionId: 'c3d2e1f0-9a8b-4c7d-8e6f-5a4b3c2d1e0f',
            message: '',
            attachmentIds: [FILE_ID],
          },
        },
      },
    }),
    ApiEnvelopeResponse({
      name: 'ExecutionsStartedExecution',
      description:
        'The message was saved (or had already been, for a retry). The snapshot of its execution.',
      contract: executionSnapshotEnvelopeSchema,
      describe: snapshotFields('data.snapshot'),
      data: { snapshot: pendingSnapshot },
      more: {
        filesOnly: {
          summary: 'A message of files only',
          data: { snapshot: attachmentsOnlySnapshot },
        },
        retry: {
          summary:
            'Retry of a send that had already succeeded: the original execution, as it is now',
          data: { snapshot: completedSnapshot },
        },
      },
    }),
    ApiErrors(
      PROBLEM.validation(
        'A field is missing or breaks a rule. One message per broken field, for the first rule it breaks. A `message` that is missing or not a string answers `message must not be empty unless a file is attached`, or the 16 384-character message when files are attached; an `attachmentIds` that is not an array answers `each value in attachmentIds must be a UUID`.',
        'submissionId must be a UUID',
        'message must be shorter than or equal to 16384 characters',
        'message must not be empty unless a file is attached',
        'attachmentIds must contain no more than 8 elements',
        "All attachmentIds's elements must be unique",
        'each value in attachmentIds must be a UUID',
      ),
      PROBLEM.unknownField,
      PROBLEM.invalidJson,
      ...PRIVATE,
      CONVERSATION_NOT_FOUND,
      {
        ...PROBLEM.notFound('project'),
        when: "The conversation's project row disappeared while this request waited for its lock: a concurrent move of the chat, a concurrent delete of the chat or of its project won. Nothing was saved. Re-read the conversation; if it still exists, send again with the same `submissionId`.",
      },
      PROBLEM.featureDisabled('agentRuntime'),
      {
        ...PROBLEM.featureDisabled('fileUploads'),
        when: '`attachmentIds` is not empty and the `fileUploads` capability is switched off. Nothing was saved. Send the message without files.',
      },
      {
        status: 404,
        code: 'attachment_not_found',
        message: 'An attached file was not found.',
        when: 'An identifier of `attachmentIds` names no file of the caller: unknown, foreign or deleted. Nothing was saved.',
      },
      {
        status: 406,
        code: 'execution_profile_unsupported',
        message: 'Select a supported execution response format.',
        when: 'The `Accept` header is not exactly `application/json` or `application/vnd.alfred.execution+json;version=1`. Nothing was saved.',
      },
      {
        status: 409,
        code: 'idempotency_conflict',
        message: 'The submission identity was already used for another request.',
        when: 'This `submissionId` was already used in the conversation with another text or other attachments. Generate a new one for a new message.',
      },
      {
        status: 409,
        code: 'thread_busy',
        message: 'The conversation is already answering.',
        when: 'An execution of the conversation is still advancing within its deadline: `pending`, `running`, `stopping`, or `recovering` with a worker write in the last 30 seconds. Nothing was saved. Find it with `GET /api/conversations/{id}/executions/active`; stop it with `POST /api/executions/{id}/stop`, where `{id}` is `data.snapshot.execution.id` of that answer, or wait for it to settle (`stopping` still blocks until a worker settles it). Then send again with the same `submissionId`.',
      },
      {
        status: 409,
        code: 'conversation_archived',
        message: 'Conversation is archived.',
        when: 'The conversation is archived: it can be read, no longer written in.',
      },
      {
        status: 409,
        code: 'attachment_not_ready',
        message: 'An attached file is not ready yet.',
        when: 'An attached file is still `processing` or has `failed`. Wait until the library reports it `ready`, or remove it.',
      },
      {
        status: 409,
        code: 'attachment_limit_reached',
        message: 'Too many images for one message.',
        when: 'More than 4 of the attached files are images.',
      },
      ...projectNotWritable(
        "The conversation's project was archived or started being deleted while this request waited for its lock. Nothing was saved; later calls answer `404`.",
      ),
      {
        ...BINDING_CHANGED,
        when: 'Only on a retry of a `submissionId` whose original execution can no longer be presented: the conversation was bound to another runtime thread since. A new message never answers this. The message was saved the first time: do not resend it, read `GET /api/conversations/{id}/messages`.',
      },
      {
        ...RECOVERY_REQUIRED,
        when: 'Only on a retry of a `submissionId` whose original execution has an inconsistent saved projection. A new message never answers this. The message was saved the first time: do not resend it; the transcript (`GET /api/conversations/{id}/messages`) stays readable.',
      },
      PROBLEM.bodyTooLarge,
      {
        status: 429,
        code: 'execution_capacity',
        message: 'The active execution limit has been reached.',
        when: 'The account (4 by default) or the deployment (64 by default) already has its maximum of active executions. Nothing was saved. Wait for one to settle and retry with the same `submissionId`.',
      },
    ),
  );
