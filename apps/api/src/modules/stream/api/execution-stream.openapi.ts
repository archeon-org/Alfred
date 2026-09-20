import { EventType } from '@ag-ui/core';
import { alfredRunStateSchema } from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { ApiErrors, ApiIdParam, ApiRoute } from '../../../common/api-docs/api-docs.decorators';
import { checkApiDocsExample } from '../../../common/api-docs/api-docs.registry';
import { PROBLEM } from '../../../common/api-docs/api-problems';
import {
  BINDING_CHANGED,
  completedSnapshot,
  CONVERSATION_ID,
  EXAMPLE_CURSOR,
  EXECUTION_CONVERSATION_GONE,
  EXECUTION_ID,
  EXECUTION_NOT_FOUND,
  failedSnapshot,
  RECOVERY_REQUIRED,
  runningSnapshot,
  SESSION_REVOKED,
  TOOL_STEP,
} from '../../executions/api/execution-snapshot.openapi';
import type { AgUiEvent } from '../application/ag-ui-translation';

const ANSWER_ID = 'f9d2a919d2d9672fe9905a28a76d31bf367b7f16db9ef8d16c269de1ab8594f7';
const CALLING_MESSAGE_ID = 'c542e8ae9cf68e8ca3396430d4431f3af85dca4532f71285bf6963d890b305db';
const RUN = { threadId: CONVERSATION_ID, runId: EXECUTION_ID };

/** Alfred-owned state of a `STATE_SNAPSHOT`: the snapshot without its answer, work and cursor. */
const stateOf = (snapshot: {
  readonly execution: unknown;
  readonly conversation: unknown;
  readonly userMessage: string;
}) => ({
  execution: snapshot.execution,
  conversation: snapshot.conversation,
  userMessage: snapshot.userMessage,
});
const RUNNING_STATE = stateOf(runningSnapshot);
const COMPLETED_STATE = stateOf(completedSnapshot);
const FAILED_STATE = stateOf(failedSnapshot);
for (const [name, state] of Object.entries({ RUNNING_STATE, COMPLETED_STATE, FAILED_STATE }))
  checkApiDocsExample(`ExecutionStreamState (${name})`, alfredRunStateSchema, state);

/** Exactly what the SSE writer puts on the wire for one AG-UI event. */
const frame = (event: AgUiEvent, cursor?: string): string =>
  `${cursor === undefined ? '' : `id: ${cursor}\n`}data: ${JSON.stringify(event)}\n\n`;

const FIRST_TEXT = 'Voici le plan de reprise';
const ATTACH: readonly AgUiEvent[] = [
  { type: EventType.RUN_STARTED, ...RUN },
  { type: EventType.STATE_SNAPSHOT, snapshot: RUNNING_STATE },
  {
    type: EventType.TOOL_CALL_START,
    toolCallId: TOOL_STEP,
    toolCallName: 'search_documents',
    parentMessageId: CALLING_MESSAGE_ID,
    timestamp: 1789922924950,
  },
  { type: EventType.TOOL_CALL_END, toolCallId: TOOL_STEP, timestamp: 1789922924950 },
  {
    type: EventType.TOOL_CALL_RESULT,
    messageId: `${TOOL_STEP}:result`,
    toolCallId: TOOL_STEP,
    content: 'completed',
    role: 'tool',
    timestamp: 1789922925310,
  },
  {
    type: EventType.TEXT_MESSAGE_START,
    messageId: ANSWER_ID,
    role: 'assistant',
    timestamp: 1789922926020,
  },
];
const LIVE_EXAMPLE = [
  ...ATTACH.map((event) => frame(event)),
  frame(
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: ANSWER_ID,
      delta: FIRST_TEXT,
      timestamp: 1789922926020,
    },
    EXAMPLE_CURSOR,
  ),
  ': ping\n\n',
  frame(
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: ANSWER_ID,
      delta: completedSnapshot.assistantText.slice(FIRST_TEXT.length),
      timestamp: 1789922932907,
    },
    EXAMPLE_CURSOR,
  ),
  frame({ type: EventType.STATE_SNAPSHOT, snapshot: COMPLETED_STATE }),
  frame({ type: EventType.TEXT_MESSAGE_END, messageId: ANSWER_ID, timestamp: 1789922932907 }),
  frame(
    {
      type: EventType.RUN_FINISHED,
      ...RUN,
      outcome: { type: 'success' },
      timestamp: 1789922932907,
    },
    EXAMPLE_CURSOR,
  ),
].join('');

const FAILED_EXAMPLE = [
  frame({ type: EventType.RUN_STARTED, ...RUN }),
  frame({ type: EventType.STATE_SNAPSHOT, snapshot: FAILED_STATE }),
  frame(
    {
      type: EventType.RUN_ERROR,
      message: 'The runtime could not complete this execution.',
      code: 'runtime_failed',
      timestamp: 1789922926020,
    },
    EXAMPLE_CURSOR,
  ),
].join('');

const UNAVAILABLE_EXAMPLE = [
  frame({ type: EventType.RUN_STARTED, ...RUN }),
  frame({ type: EventType.STATE_SNAPSHOT, snapshot: RUNNING_STATE }, EXAMPLE_CURSOR),
  'event: error\ndata: {"code":"execution_stream_unavailable"}\n\n',
].join('');

const DESCRIPTION = `A server-sent-events stream (\`text/event-stream\`) of what the execution does, in the AG-UI event vocabulary. Observation is read-only: opening, closing or losing this connection never starts, stops or changes the execution, which a background worker runs. The route needs the \`Authorization\` header, which a browser \`EventSource\` cannot send: use \`fetch\` and read the body as a stream. Swagger UI shows nothing until the stream ends; try it with \`curl -N\`.

## Frames
- An event is an **unnamed** frame: \`data: <one JSON object>\` and a blank line. \`type\` names the AG-UI event; \`timestamp\` is server time in epoch milliseconds when it is known. \`threadId\` is the conversation id and \`runId\` the execution id; runtime identifiers never appear, other ids are opaque.
- The last frame of each batch also carries \`id: <cursor>\`: the position to send back as \`Last-Event-ID\`.
- \`: ping\` is a comment sent every 25 seconds (default) so that proxies keep the connection open. Ignore it.
- The only named frame is \`event: error\` with \`data: {"code":"execution_stream_unavailable"}\`. It says this *stream* cannot continue, not that the execution failed; the server closes right after. Reconnect with backoff.

## What one connection sends
1. **On attach, always the whole run so far**, rebuilt from saved state: \`RUN_STARTED\`, \`STATE_SNAPSHOT\`, the steps of the work log, then the answer so far as \`TEXT_MESSAGE_START\` and one \`TEXT_MESSAGE_CONTENT\`.
2. **Then only what changed.** The saved state is read every 500 ms, so text arrives as coalesced \`delta\`s to append, and a new \`STATE_SNAPSHOT\` follows a change of the execution or the conversation (status, title).
3. **When the execution settles**: \`TEXT_MESSAGE_END\`, then \`RUN_FINISHED\` or \`RUN_ERROR\`, and the server closes. An execution that had already settled sends all of this at once. A parked execution without \`finishedAt\` is not settled: its stream stays open with heartbeats only.

| Event | Meaning |
| --- | --- |
| \`RUN_STARTED\` | Start of the replay; sent once per connection |
| \`STATE_SNAPSHOT\` | \`snapshot\` = \`{ execution, conversation, userMessage, attachments? }\`, the same objects as in \`GET /api/executions/{id}\` |
| \`TEXT_MESSAGE_START\` / \`_CONTENT\` / \`_END\` | The answer, or an intermediate message; append each \`delta\` to its \`messageId\`. \`subagentRunId\` is set when a specialist wrote it |
| \`REASONING_START\` / \`_END\`, \`REASONING_MESSAGE_START\` / \`_CONTENT\` / \`_END\` | A reasoning marker; the \`REASONING_MESSAGE_*\` events only when the deployment exposes reasoning text |
| \`TOOL_CALL_START\` / \`TOOL_CALL_END\` | A tool call or a delegation; \`toolCallName\` is the sanitized name. \`END\` follows \`START\` at once: arguments are never streamed |
| \`TOOL_CALL_RESULT\` | The outcome word only: \`content\` is \`completed\`, \`failed\` or \`interrupted\` |
| \`SUBAGENT_STARTED\` / \`SUBAGENT_FINISHED\` / \`SUBAGENT_ERROR\` | A specialist at work: \`subagentRunId\`, \`name\`, and \`parentToolCallId\` when a delegation started it |
| \`STEP_STARTED\` / \`STEP_FINISHED\` | A model round trip that produced nothing visible |
| \`CUSTOM\` named \`alfred.work.omitted\` | \`value.omittedSteps\`: steps counted but not sent once the log reached 1 024 steps |
| \`RUN_FINISHED\` | Settled without error. \`outcome: { "type": "success" }\` when \`completed\`; no \`outcome\` when \`cancelled\` |
| \`RUN_ERROR\` | Settled as \`failed\`, \`timed_out\`, \`interrupted\` or \`recovery_required\`; \`code\` is the execution's \`errorCode\` (its \`status\` when there is none), \`message\` its fixed \`error\` sentence |

## Reconnecting
- Every connection replays the run from its start: when \`RUN_STARTED\` arrives, reset what you had built for this execution. Nothing is lost by disconnecting, because the stream is derived from saved state, not from a live feed.
- \`Last-Event-ID\` is optional. The cursor is verified (issued by this deployment, for this execution, not expired) but it does not make the server skip events. A cursor that fails answers \`409 invalid_cursor\`: reconnect without the header.
- The server closes **without** a lifecycle event when the access token reaches its expiry (refresh, then reconnect), when the periodic check of the session and of the access to the execution fails (every 20 seconds by default), when the client reads too slowly (a write not drained within 10 seconds, or 4 MiB buffered), and after \`event: error\`. Reconnect with backoff; a \`401\` or \`404\` on reconnection is final.
- An unsettled execution created before durable streaming existed (a legacy row) is sent once, then the connection closes without a lifecycle event.

## Limits
4 concurrent streams per account and 128 per API instance by default; one frame is at most 2 MiB. Errors below are JSON answers given **before** the stream opens; once the \`200\` is sent, a problem is only ever reported in-stream or by closing.`;

export const DocObserveExecution = () =>
  applyDecorators(
    ApiRoute('Observe an execution as a stream of AG-UI events', DESCRIPTION),
    ApiIdParam(
      'id',
      'Identifier of an execution of the signed-in account: `snapshot.execution.id` of the answer that started it.',
      EXECUTION_ID,
    ),
    ApiHeader({
      name: 'Last-Event-ID',
      required: false,
      description:
        'The last `id:` received on a previous connection, or `snapshot.cursor` of a JSON answer. Opaque: send it unchanged. Verified, never required. Example: `v1.ZXhhbXBsZS1jdXJzb3Itbm90LWEtcmVhbC1vbmU`.',
    }),
    ApiResponse({
      status: 200,
      description:
        'The stream is open. Headers: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-store, no-transform`, `X-Accel-Buffering: no`.',
      content: {
        'text/event-stream': {
          schema: {
            type: 'string',
            description:
              'Server-sent events: unnamed `data:` frames holding one AG-UI event each, `: ping` comments, and at most one final `event: error` frame.',
          },
          examples: {
            live: {
              summary: 'Attach to a running execution and follow it until it completes',
              value: LIVE_EXAMPLE,
            },
            failed: {
              summary: 'Attach to an execution that already failed: replay, `RUN_ERROR`, close',
              value: FAILED_EXAMPLE,
            },
            unavailable: {
              summary: 'The stream cannot continue: transport frame, then the server closes',
              value: UNAVAILABLE_EXAMPLE,
            },
          },
        },
      },
    }),
    ApiErrors(
      PROBLEM.unauthenticated,
      PROBLEM.invalidToken,
      {
        ...SESSION_REVOKED,
        when: 'The session behind the access token was signed out or revoked, the account was disabled, or the token expired while the stream was being prepared. Refresh the session once; if that fails, sign in again.',
      },
      EXECUTION_NOT_FOUND,
      EXECUTION_CONVERSATION_GONE,
      PROBLEM.featureDisabled('agentRuntime'),
      {
        status: 409,
        code: 'invalid_cursor',
        message: 'The stream position is no longer available.',
        when: '`Last-Event-ID` is malformed, expired (one hour by default), was issued for another execution, or the deployment rotated its cursor key. Reconnect without the header: the run is replayed from its start anyway.',
      },
      BINDING_CHANGED,
      RECOVERY_REQUIRED,
      {
        status: 429,
        code: 'stream_capacity_exceeded',
        message: 'Too many active streams. Try again shortly.',
        when: 'The account already has its maximum of open streams (4 by default), or this API instance has (128 by default). Close a stream you no longer need, or retry with backoff.',
      },
      {
        status: 503,
        code: 'execution_stream_unavailable',
        message: 'Internal server error',
        when: 'Checking the session or reading the saved state took more than 5 seconds. Nothing was opened. Retry with backoff.',
      },
    ),
  );
