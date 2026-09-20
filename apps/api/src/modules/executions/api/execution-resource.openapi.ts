import {
  executionSnapshotEnvelopeSchema,
  executionTraceLinkEnvelopeSchema,
} from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiIdParam,
  ApiRoute,
} from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';
import {
  BINDING_CHANGED,
  cancelledSnapshot,
  completedSnapshot,
  EXECUTION_CONVERSATION_GONE,
  EXECUTION_ID,
  EXECUTION_NOT_FOUND,
  failedSnapshot,
  RECOVERY_REQUIRED,
  runningSnapshot,
  SESSION_REVOKED,
  snapshotFields,
  stoppingSnapshot,
} from './execution-snapshot.openapi';

const EXECUTION_PARAM = ApiIdParam(
  'id',
  'Identifier of an execution of the signed-in account: `snapshot.execution.id` of the answer that started it.',
  EXECUTION_ID,
);

export const DocGetExecution = () =>
  applyDecorators(
    ApiRoute(
      'Read the current state of an execution',
      `The cumulative snapshot of one execution: its status, the user message, the answer so far and the work log. It is the polling alternative to the event stream, and what a client reads once after a stream ended without a lifecycle event.

The snapshot comes from one committed revision, so it is always coherent; \`revision\` only grows, which lets a client drop a stale read. A settled execution stays readable. The session is checked on every call, not only the access token.`,
    ),
    EXECUTION_PARAM,
    ApiEnvelopeResponse({
      name: 'ExecutionsExecutionSnapshot',
      description: 'The snapshot of the execution.',
      contract: executionSnapshotEnvelopeSchema,
      describe: snapshotFields('data.snapshot'),
      data: { snapshot: runningSnapshot },
      more: {
        completed: {
          summary: 'Settled with its full answer',
          data: { snapshot: completedSnapshot },
        },
        failed: {
          summary: 'The runtime failed: `error` and `errorCode` say why, in fixed words',
          data: { snapshot: failedSnapshot },
        },
      },
    }),
    ApiErrors(
      PROBLEM.unauthenticated,
      PROBLEM.invalidToken,
      SESSION_REVOKED,
      EXECUTION_NOT_FOUND,
      EXECUTION_CONVERSATION_GONE,
      PROBLEM.featureDisabled('agentRuntime'),
      BINDING_CHANGED,
      RECOVERY_REQUIRED,
    ),
  );

export const DocStopExecution = () =>
  applyDecorators(
    ApiRoute(
      'Ask an execution to stop',
      `Records the intent to stop and answers the snapshot as it is right after. It takes no body.

- An active execution becomes \`stopping\`. A background worker then cancels the run in the runtime and settles the execution, normally as \`cancelled\` (\`timed_out\` if its deadline passed meanwhile). This answer therefore does not prove that a tool call already stopped: keep observing, or poll, until the status is terminal. An execution created before durable streaming existed (a legacy row) cannot be cancelled safely and becomes \`recovery_required\` instead.
- **Idempotent**: stopping an execution that is already \`stopping\` or already settled changes nothing and answers \`200\` with its current snapshot.
- The text and the work committed before the stop are kept; steps still running are reported \`interrupted\` once the execution settles.
- While the execution is \`stopping\` the conversation still refuses a new message with \`thread_busy\`.`,
    ),
    EXECUTION_PARAM,
    ApiEnvelopeResponse({
      name: 'ExecutionsStoppedExecution',
      description:
        'The stop was recorded, or there was nothing left to stop. The current snapshot.',
      contract: executionSnapshotEnvelopeSchema,
      describe: snapshotFields('data.snapshot'),
      data: { snapshot: stoppingSnapshot },
      more: {
        settled: {
          summary: 'Once the runtime confirmed the cancellation (what a later read shows)',
          data: { snapshot: cancelledSnapshot },
        },
        alreadyFinished: {
          summary: 'The execution had already completed: nothing changed',
          data: { snapshot: completedSnapshot },
        },
      },
    }),
    ApiErrors(
      PROBLEM.unauthenticated,
      PROBLEM.invalidToken,
      SESSION_REVOKED,
      EXECUTION_NOT_FOUND,
      EXECUTION_CONVERSATION_GONE,
      PROBLEM.featureDisabled('agentRuntime'),
      BINDING_CHANGED,
      RECOVERY_REQUIRED,
      {
        status: 409,
        code: 'project_archived',
        message: 'Project is archived.',
        when: 'The project was archived while this request was waiting for its lock. `project_deleting` ("Project is being deleted.") is the same race with a deletion.',
      },
    ),
  );

export const DocGetExecutionTraceLink = () =>
  applyDecorators(
    ApiRoute(
      'Get the address of an execution trace (development diagnostic)',
      `The address of this execution's trace in the observability console of the agent runtime, for a developer who wants to see what the runtime did. It is the only place where a runtime run identifier leaves the API, inside the URL.

Needs **two** capabilities: \`agentRuntime\` and \`traceLinks\`. \`traceLinks\` is a development diagnostic that a production deployment refuses to start with, so treat this route as absent in production. The link is built from the deployment's configuration; the API does not check that the trace exists in the console or that the reader has an account there.`,
    ),
    EXECUTION_PARAM,
    ApiEnvelopeResponse({
      name: 'ExecutionsTraceLink',
      description: 'The address of the trace.',
      contract: executionTraceLinkEnvelopeSchema,
      describe: {
        'data.url':
          'Absolute `http(s)` address of the trace, without credentials, 2 048 characters at most. Open it in a new tab; never fetch it from the application.',
      },
      data: {
        url: 'https://smith.langchain.com/o/0f1e2d3c-4b5a-4978-8695-a4b3c2d1e0f9/projects/p/a1b2c3d4-e5f6-4789-8a9b-0c1d2e3f4a5b/r/1efc3a52-7d10-4b6e-9f21-3c8a5d7e9b04?poll=true',
      },
    }),
    ApiErrors(
      PROBLEM.unauthenticated,
      PROBLEM.invalidToken,
      SESSION_REVOKED,
      EXECUTION_NOT_FOUND,
      EXECUTION_CONVERSATION_GONE,
      {
        status: 404,
        code: 'trace_unavailable',
        message: 'This execution has no runtime trace.',
        when: 'The runtime has not accepted the run yet (the execution is still `pending`) or never did. Retry once the execution is `running`.',
      },
      {
        ...PROBLEM.featureDisabled('traceLinks'),
        when: 'The `traceLinks` or the `agentRuntime` capability is switched off on this deployment. Do not retry; read `GET /api/platform` to know which capabilities are on.',
      },
      BINDING_CHANGED,
      {
        status: 500,
        code: 'trace_link_invalid',
        message: 'Internal server error',
        when: 'The configured console address yields a link the contract refuses. Startup validation is meant to prevent it; report it to the operator.',
      },
    ),
  );
