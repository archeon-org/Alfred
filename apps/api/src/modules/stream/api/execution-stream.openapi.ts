import {
  alfredRunStateSchema,
  EXECUTION_STREAM_ERROR_EVENT,
  EXECUTION_STREAM_UNAVAILABLE_CODE,
  type AlfredRunState,
  type WorkStep,
} from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { ApiErrors, ApiIdParam, ApiRoute } from '../../../common/api-docs/api-docs.decorators';
import {
  checkApiDocsExample,
  recordApiDocsProblem,
} from '../../../common/api-docs/api-docs.registry';
import { PROBLEM } from '../../../common/api-docs/api-problems';
import {
  ACCOUNT_GONE_MEANWHILE,
  BINDING_CHANGED,
  completedSnapshot,
  EXAMPLE_CURSOR,
  EXECUTION_CONVERSATION_GONE,
  EXECUTION_ID,
  EXECUTION_NOT_FOUND,
  failedSnapshot,
  pendingSnapshot,
  RECOVERY_REQUIRED,
  runningSnapshot,
  SESSION_REVOKED,
} from '../../executions/api/execution-snapshot.openapi';
import {
  translateObservedView,
  type AgUiEvent,
  type ObservedMessage,
  type ObservedView,
} from '../application/ag-ui-translation';

/** Opaque ids the stream adds to a snapshot: the answer, and the messages that issued the calls. */
const ANSWER_ID = 'f9d2a919d2d9672fe9905a28a76d31bf367b7f16db9ef8d16c269de1ab8594f7';
const ISSUED_BY: Readonly<Partial<Record<WorkStep['kind'], string>>> = {
  tool: 'c542e8ae9cf68e8ca3396430d4431f3af85dca4532f71285bf6963d890b305db',
  delegation: '3a7e5c1d9b2f4860a1c3e5f7092b4d6e8f0a1c2b3d4e5f60718293a4b5c6d7e8',
};
const ANSWER_STARTED_AT = 1789922926240;

interface SnapshotExample {
  readonly execution: { readonly finishedAt: string | null };
  readonly conversation: unknown;
  readonly userMessage: string;
  readonly work: { readonly steps: readonly WorkStep[] };
}

/**
 * What an observer sees of a snapshot example. The Alfred-owned state of a `STATE_SNAPSHOT` is the
 * snapshot without its answer, work and cursor; a call gains the id of the message that issued it.
 */
function observed(
  name: string,
  snapshot: SnapshotExample,
  answer: ObservedMessage | null,
): ObservedView {
  const state = {
    execution: snapshot.execution,
    conversation: snapshot.conversation,
    userMessage: snapshot.userMessage,
  };
  checkApiDocsExample(`ExecutionStreamState (${name})`, alfredRunStateSchema, state);
  return {
    state: state as AlfredRunState,
    answer,
    steps: snapshot.work.steps.map((step) => {
      const messageId = ISSUED_BY[step.kind];
      return messageId === undefined ? step : { ...step, messageId };
    }),
    omittedSteps: 0,
    settled: snapshot.execution.finishedAt !== null,
  };
}

/** Exactly what the SSE writer puts on the wire for one AG-UI event. */
const frame = (event: AgUiEvent, cursor?: string): string =>
  `${cursor === undefined ? '' : `id: ${cursor}\n`}data: ${JSON.stringify(event)}\n\n`;

/**
 * One batch as the observer writes it: the events the real translator derives from two successive
 * views, the cursor on the last frame. The examples therefore cannot drift from the translation
 * rules. A mistake is recorded for the contract test, never thrown: it must not stop a boot.
 */
function batch(previous: ObservedView | null, next: ObservedView): string {
  try {
    const events = translateObservedView(previous, next);
    return events
      .map((event, index) => frame(event, index === events.length - 1 ? EXAMPLE_CURSOR : undefined))
      .join('');
  } catch (error) {
    recordApiDocsProblem(
      `ExecutionStream example: views the translator refuses (${String(error)})`,
    );
    return '';
  }
}

const answer = (text: string, at: number): ObservedMessage => ({
  id: ANSWER_ID,
  text,
  startedAt: ANSWER_STARTED_AT,
  finishedAt: at,
});
const FINAL_TEXT = completedSnapshot.assistantText;

/** The three moments of the `live` example: attach, the delegation ends, the execution completes. */
const ATTACHED = observed(
  'running',
  runningSnapshot,
  answer(runningSnapshot.assistantText, 1789922926410),
);
const DELEGATION_ENDED = observed(
  'delegation ended',
  { ...runningSnapshot, work: completedSnapshot.work },
  answer(FINAL_TEXT.slice(0, FINAL_TEXT.indexOf('\n2.')), 1789922927480),
);
const COMPLETED = observed('completed', completedSnapshot, answer(FINAL_TEXT, 1789922932907));

const LIVE_EXAMPLE = [
  batch(null, ATTACHED),
  batch(ATTACHED, DELEGATION_ENDED),
  batch(DELEGATION_ENDED, COMPLETED),
].join('');

const FAILED_EXAMPLE = batch(null, observed('failed', failedSnapshot, null));

/** A run the runtime accepted a moment ago: nothing to show yet, then the stream breaks. */
const UNAVAILABLE_EXAMPLE = [
  batch(
    null,
    observed('dispatched', { ...pendingSnapshot, execution: runningSnapshot.execution }, null),
  ),
  ': ping\n\n',
  `event: ${EXECUTION_STREAM_ERROR_EVENT}\ndata: ${JSON.stringify({ code: EXECUTION_STREAM_UNAVAILABLE_CODE })}\n\n`,
].join('');

const DESCRIPTION = `A server-sent-events stream (\`text/event-stream\`) of what the execution does, in the AG-UI event vocabulary. Observation is read-only: opening, closing or losing this connection never starts, stops or changes the execution, which a background worker runs. The route needs the \`Authorization\` header, which a browser \`EventSource\` cannot send: use \`fetch\` and read the body as a stream. Swagger UI shows nothing until the stream ends; try it with \`curl -N\`.

## Frames
- An event is an **unnamed** frame: \`data: <one JSON object>\` and a blank line. \`type\` names the AG-UI event; \`timestamp\` is server time in epoch milliseconds when it is known. \`threadId\` is the conversation id and \`runId\` the execution id; runtime identifiers never appear, other ids are opaque.
- The last frame of each batch also carries \`id: <cursor>\`: the position to send back as \`Last-Event-ID\`.
- \`: ping\` is a comment sent every 25 seconds (default) so that proxies keep the connection open. Ignore it.
- The only named frame is \`event: error\` with \`data: {"code":"execution_stream_unavailable"}\`. It says this *stream* cannot continue, not that the execution failed, and it hides the cause on purpose; the server closes right after. Reconnect with backoff: the answer to the reconnection tells what happened (see Reconnecting).

## What one connection sends
1. **On attach, always the whole run so far**, rebuilt from saved state: \`RUN_STARTED\`, \`STATE_SNAPSHOT\`, the steps of the work log, then the answer so far as \`TEXT_MESSAGE_START\` and one \`TEXT_MESSAGE_CONTENT\`.
2. **Then only what changed.** The saved state is read every 500 ms, so text arrives as coalesced \`delta\`s to append, and a new \`STATE_SNAPSHOT\` follows a change of the execution or the conversation (status, title). \`lastActivityAt\` and \`updatedAt\` of the conversation move with the answer and never cause a \`STATE_SNAPSHOT\` on their own.
3. **When the execution settles**: \`TEXT_MESSAGE_END\`, then \`RUN_FINISHED\` or \`RUN_ERROR\`, and the server closes. An execution that had already settled sends all of this at once. A parked execution without \`finishedAt\` is not settled: its stream stays open with heartbeats only.

Inside one batch the order is fixed: \`STATE_SNAPSHOT\`, the steps in first-seen order, the answer text, then the endings of specialists (\`SUBAGENT_FINISHED\` or \`SUBAGENT_ERROR\`, followed by the \`TOOL_CALL_RESULT\` of their delegation), and last \`TEXT_MESSAGE_END\` and the lifecycle event.

| Event | Meaning |
| --- | --- |
| \`RUN_STARTED\` | Start of the replay; sent once per connection |
| \`STATE_SNAPSHOT\` | \`snapshot\` = \`{ execution, conversation, userMessage, attachments? }\`, the same objects as in \`GET /api/executions/{id}\` |
| \`TEXT_MESSAGE_START\` / \`_CONTENT\` / \`_END\` | The answer, or an intermediate message; append each \`delta\` to its \`messageId\`. \`subagentRunId\` is set when a specialist wrote it |
| \`REASONING_START\` / \`_END\`, \`REASONING_MESSAGE_START\` / \`_CONTENT\` / \`_END\` | A reasoning marker; all five share one \`messageId\`, the id of the \`reasoning\` step. The \`REASONING_MESSAGE_*\` events only when the deployment exposes reasoning text |
| \`TOOL_CALL_START\` / \`TOOL_CALL_END\` | A tool call or a delegation; \`toolCallId\` is the id of the step, \`toolCallName\` the sanitized name (\`task\` for a delegation), \`parentMessageId\` the opaque message that issued it (on the orchestrator's own calls only). \`END\` follows \`START\` at once: arguments are never streamed |
| \`TOOL_CALL_RESULT\` | The outcome word only: \`content\` is \`completed\`, \`failed\` or \`interrupted\` |
| \`SUBAGENT_STARTED\` / \`SUBAGENT_FINISHED\` / \`SUBAGENT_ERROR\` | A specialist at work, sent once its work was observed. For a delegation, \`subagentRunId\` and \`parentToolCallId\` are both the \`toolCallId\` of the \`task\` call, and the specialist's own events carry that \`subagentRunId\`. \`SUBAGENT_ERROR\` has \`code\` \`failed\` or \`interrupted\` |
| \`STEP_STARTED\` / \`STEP_FINISHED\` | A model round trip that produced nothing visible |
| \`CUSTOM\` named \`alfred.work.omitted\` | \`value.omittedSteps\`: steps counted but not sent once the log reached 1 024 steps |
| \`RUN_FINISHED\` | Settled without error. \`outcome: { "type": "success" }\` when \`completed\`; no \`outcome\` when \`cancelled\` |
| \`RUN_ERROR\` | Settled as \`failed\`, \`timed_out\`, \`interrupted\` or \`recovery_required\`; \`code\` is the execution's \`errorCode\` (its \`status\` when there is none), \`message\` its fixed \`error\` sentence |

## Reconnecting
- Every connection replays the run from its start: when \`RUN_STARTED\` arrives, reset what you had built for this execution. Nothing is lost by disconnecting, because the stream is derived from saved state, not from a live feed.
- \`Last-Event-ID\` is optional. The cursor is verified (issued by this deployment, for this execution, not expired) but it does not make the server skip events. A cursor that fails answers \`409 invalid_cursor\`: reconnect without the header.
- The server closes **without** a lifecycle event when the access token reaches its expiry, when the periodic check of the session and of the access to the execution fails (every 20 seconds by default), when the client reads too slowly (a write not drained within 10 seconds, or 4 MiB buffered), and after \`event: error\`. Reconnect with backoff.
- **The answer to the reconnection decides what comes next.** \`401\`: the usual case is the expired access token; refresh the session once and reconnect, and treat a second \`401\` as final (sign in again). \`404\`, and any \`409\` other than \`invalid_cursor\`, are final: stop reconnecting and read \`GET /api/conversations/{id}/messages\`. \`409 invalid_cursor\`: reconnect once without \`Last-Event-ID\`. \`429\` and \`503\`: retry with backoff.
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
              summary:
                'Attach to a running execution (reasoning, a tool call, a delegation at work), see the specialist end, follow the answer until it completes',
              value: LIVE_EXAMPLE,
            },
            failed: {
              summary: 'Attach to an execution that already failed: replay, `RUN_ERROR`, close',
              value: FAILED_EXAMPLE,
            },
            unavailable: {
              summary:
                'Nothing to show yet, a heartbeat, then the stream cannot continue: transport frame, and the server closes',
              value: UNAVAILABLE_EXAMPLE,
            },
          },
        },
      },
    }),
    ApiErrors(
      ...PROBLEM.session,
      {
        ...SESSION_REVOKED,
        when: 'The session behind the access token was signed out or revoked, the account was disabled, or the token expired while the stream was being prepared. Refresh the session once; if that fails, sign in again.',
      },
      ACCOUNT_GONE_MEANWHILE,
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
      PROBLEM.masked(
        503,
        EXECUTION_STREAM_UNAVAILABLE_CODE,
        'Checking the session or reading the saved state took more than 5 seconds. Nothing was opened. Retry with backoff.',
      ),
    ),
  );
