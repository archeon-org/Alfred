import type { WorkStep } from '@alfred/contracts';
import type { ApiProblem } from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';
import {
  CONVERSATION_ID,
  conversationFields as sharedConversationFields,
  standaloneChat,
} from '../../conversations/api/conversations-shared.openapi';

/**
 * Shared by every route that answers an execution snapshot: field texts, examples, errors. The
 * conversation is the standalone chat of the `conversations` examples, so a reader who follows
 * "create a chat, then send a message" finds the same identifiers in both tags.
 */
export const EXECUTION_ID = 'b2a7c9d4-3e1f-4a6b-9c8d-5f0e1a2b3c4d';
export const FILE_ID = '9b0d7c2a-1e34-4f56-8a90-b1c2d3e4f5a6';
/** Invented: a real cursor is an encrypted token of a few hundred characters. */
export const EXAMPLE_CURSOR = 'v1.ZXhhbXBsZS1jdXJzb3Itbm90LWEtcmVhbC1vbmU';
const REASONING_STEP = 'b2e08e7358ed3bd52b2cbd941add7d2aa810c3c69be516fcb3bdc1a51f8a3514';
const TOOL_STEP = '97fd2835894cfc22339dc291ea2cf46853e6a8801597cebe4d1d0aa3f6315adf';
const DELEGATION_STEP = '82c8553d9ac9dc8853ba0b12a25cb018a80fe7b30bd35d6167e121c14f6c47ea';

export const EXECUTION_STATUS_TEXT =
  'Where the work stands. Advancing: `pending` (saved, waiting for a worker), `running` (the runtime is answering), `recovering` (a transient runtime failure, the worker reconnects), `stopping` (Stop requested, cancellation not confirmed yet). Parked, a new message may replace it: `interrupted` (the runtime paused and needs attention), `recovery_required` (the outcome cannot be established automatically). Terminal: `completed`, `failed`, `cancelled`, `timed_out`.';

export const attachmentFields = (path: string) => ({
  [path]:
    'The library files the user message carried, in the order they were attached. Absent when the message had none, and whenever the `fileUploads` capability is off on this deployment: files already attached are then not listed.',
  [`${path}[].fileId`]: 'Identifier of the file in the personal library (`/api/files`).',
  [`${path}[].name`]:
    'Name of the file when the message was sent; a later rename does not change it.',
  [`${path}[].kind`]: 'Family of the file: `pdf`, `docx` or `image`.',
  [`${path}[].mediaType`]: 'Media type established from the bytes at upload.',
  [`${path}[].sizeBytes`]: 'Size of the original file, in bytes.',
  [`${path}[].available`]:
    '`false` once the file was deleted from the library: the transcript still names it, it can no longer be downloaded.',
  [`${path}[].delivery`]:
    'What the model received: `text` (extracted text), `image` (the reduced copy), `unavailable` (nothing could be delivered). `null` until the message is dispatched to the runtime.',
  [`${path}[].truncated`]: '`true` when the extracted text was cut to fit the per-message budget.',
});

const executionFields = (path: string) => ({
  [path]: 'The execution: one submitted message and the work that answers it.',
  [`${path}.id`]:
    'Identifier of the execution. Use it with `GET /api/executions/{id}`, `/events`, `/stop`.',
  [`${path}.conversationId`]: 'The conversation the message was sent in.',
  [`${path}.status`]: EXECUTION_STATUS_TEXT,
  [`${path}.error`]:
    'Fixed English sentence for `errorCode`, never provider or exception text. `null` while nothing went wrong.',
  [`${path}.errorCode`]:
    'Why the execution did not complete, `null` otherwise. One of `runtime_failed`, `runtime_interrupted`, `runtime_output_incomplete`, `runtime_recovery_gap`, `runtime_event_invalid`, `runtime_source_id_missing`, `runtime_projection_limit`, `execution_deadline_exceeded`, `execution_authority_lost`, `superseded` (a newer message replaced a parked answer).',
  [`${path}.createdAt`]: 'When the message was accepted (UTC).',
  [`${path}.startedAt`]: 'When the runtime started the work (UTC); `null` until then.',
  [`${path}.finishedAt`]:
    'When the outcome was established (UTC); `null` until then. Set on every terminal status, and on a `recovery_required` execution whose run is known to have ended.',
});

/** The shared texts of a conversation, under the object that holds it in a snapshot. */
const conversationFields = (path: string) => ({
  [path]: 'The conversation as it is now, title included (it is set from the first message).',
  ...sharedConversationFields(`${path}.`),
});

/** Descriptions of every field of an execution snapshot found at `path`. */
export const snapshotFields = (path: string) => ({
  [path]:
    'Cumulative public state of the execution, read from one committed revision: it is always coherent, and a later read only ever adds to it.',
  ...executionFields(`${path}.execution`),
  ...conversationFields(`${path}.conversation`),
  [`${path}.userMessage`]:
    'The submitted text, trimmed, with `\\r\\n` stored as `\\n`. Empty for a message of files only.',
  ...attachmentFields(`${path}.attachments`),
  [`${path}.assistantText`]:
    'The answer so far: the latest visible message of the orchestrator, complete once the execution is `completed`. At most 262 144 characters. Earlier visible messages are `message` steps of `work`.',
  [`${path}.activities`]:
    'Visible tool calls, flat, kept for clients that predate `work`. Prefer `work.steps`.',
  [`${path}.activities[].id`]:
    'Opaque stable identifier of the call (the same as its `work` step).',
  [`${path}.activities[].label`]: 'Sanitized tool name. Arguments and results are never exposed.',
  [`${path}.activities[].status`]:
    'Last status the runtime reported: `running`, `completed`, `failed` or `interrupted`. A call still running when the execution settled stays `running` here; `work.steps` reports it `interrupted`.',
  [`${path}.cursor`]:
    'Opaque, encrypted position of this revision, valid for this execution only and for a limited time (one hour by default). Send it as `Last-Event-ID` when opening `GET /api/executions/{id}/events`. This API always answers a string.',
  [`${path}.revision`]:
    'Number of committed changes of the projection; `0` before any runtime output. It only grows: drop a snapshot whose revision is lower than the one you hold.',
  [`${path}.work`]:
    'The work log behind the answer: what Alfred did, in first-seen order. The answer itself is not a step.',
  [`${path}.work.steps`]:
    'At most 1 024 steps; beyond that they are only counted in `omittedSteps`.',
  [`${path}.work.steps[].id`]: 'Opaque stable identifier of the step.',
  [`${path}.work.steps[].kind`]:
    '`message` (intermediate assistant text), `reasoning` (a reasoning marker), `tool` (a tool call), `delegation` (a task handed to a specialist), `subagent` (a specialist seen at work without its delegation), `generation` (a model round trip that produced nothing visible).',
  [`${path}.work.steps[].label`]:
    'Sanitized tool name for `tool` and `delegation`, `subagent` for a `subagent` step, empty otherwise.',
  [`${path}.work.steps[].status`]:
    '`running`, `completed`, `failed`, or `interrupted` for a step still running when its execution settled (Stop, deadline, failure).',
  [`${path}.work.steps[].startedAt`]: 'Server time the step started, in epoch milliseconds.',
  [`${path}.work.steps[].finishedAt`]:
    'Server time the step ended, in epoch milliseconds; `null` while it runs.',
  [`${path}.work.steps[].parentId`]:
    'The `delegation` or `subagent` step this step belongs to. Absent for a step of the orchestrator.',
  [`${path}.work.steps[].specialist`]:
    'Name of the specialist, on `delegation` and `subagent` steps once known.',
  [`${path}.work.steps[].subagentStatus`]:
    'Lifecycle of the specialist a delegation invoked, once its work was observed. It can end before or after the delegating call.',
  [`${path}.work.steps[].text`]:
    'Text of a `message` or `reasoning` step, cut at 4 000 characters here (the event stream sends it whole). Empty for reasoning when the deployment does not expose reasoning content.',
  [`${path}.work.omittedSteps`]:
    'Steps counted but not recorded once the bound was reached. Show "and N more" rather than presenting the log as complete.',
});

const MESSAGE = 'Rédige un plan de reprise pour la base clients.';
const SENT_AT = '2026-09-20T16:48:44.120Z';

/** The chat right after its first message: titled from it, its activity set to the send time. */
const conversation = {
  ...standaloneChat,
  title: MESSAGE,
  titleSource: 'auto',
  lastActivityAt: SENT_AT,
  updatedAt: SENT_AT,
};
/**
 * `lastActivityAt` follows the answer, not only the send: the worker moves it with the first
 * progress commit, then at most every 5 seconds, and once more when the execution finishes.
 */
const touched = (at: string) => ({ ...conversation, lastActivityAt: at, updatedAt: at });

const execution = {
  id: EXECUTION_ID,
  conversationId: CONVERSATION_ID,
  status: 'pending',
  error: null,
  errorCode: null,
  createdAt: SENT_AT,
  startedAt: null,
  finishedAt: null,
};

const reasoningStep: WorkStep = {
  id: REASONING_STEP,
  kind: 'reasoning',
  label: '',
  status: 'completed',
  startedAt: 1789922924412,
  finishedAt: 1789922924950,
  text: 'Le plan doit couvrir le gel des écritures, la restauration et le rejeu des journaux.',
};
const toolStep: WorkStep = {
  id: TOOL_STEP,
  kind: 'tool',
  label: 'search_documents',
  status: 'completed',
  startedAt: 1789922924950,
  finishedAt: 1789922925310,
};
const delegationStep: WorkStep = {
  id: DELEGATION_STEP,
  kind: 'delegation',
  label: 'task',
  status: 'running',
  startedAt: 1789922926020,
  finishedAt: null,
  specialist: 'database-expert',
  subagentStatus: 'running',
};

/** Just accepted: nothing dispatched yet. What `POST …/executions` answers for a new message. */
export const pendingSnapshot = {
  execution,
  conversation,
  userMessage: MESSAGE,
  assistantText: '',
  activities: [],
  cursor: EXAMPLE_CURSOR,
  revision: 0,
  work: { steps: [], omittedSteps: 0 },
};

export const runningSnapshot = {
  ...pendingSnapshot,
  execution: { ...execution, status: 'running', startedAt: '2026-09-20T16:48:44.398Z' },
  conversation: touched('2026-09-20T16:48:44.931Z'),
  assistantText: 'Voici le plan de reprise en trois étapes',
  activities: [
    { id: TOOL_STEP, label: 'search_documents', status: 'completed' },
    { id: DELEGATION_STEP, label: 'task', status: 'running' },
  ],
  revision: 14,
  work: { steps: [reasoningStep, toolStep, delegationStep], omittedSteps: 0 },
};

const finishedDelegation: WorkStep = {
  ...delegationStep,
  status: 'completed',
  finishedAt: 1789922927480,
  subagentStatus: 'completed',
};

export const completedSnapshot = {
  ...runningSnapshot,
  execution: {
    ...runningSnapshot.execution,
    status: 'completed',
    finishedAt: '2026-09-20T16:48:52.907Z',
  },
  conversation: touched('2026-09-20T16:48:52.911Z'),
  assistantText:
    'Voici le plan de reprise en trois étapes :\n\n1. Geler les écritures.\n2. Restaurer la dernière sauvegarde vérifiée.\n3. Rejouer les journaux jusqu’à l’incident.',
  activities: [
    { id: TOOL_STEP, label: 'search_documents', status: 'completed' },
    { id: DELEGATION_STEP, label: 'task', status: 'completed' },
  ],
  revision: 37,
  work: { steps: [reasoningStep, toolStep, finishedDelegation], omittedSteps: 0 },
};

/** Stop was accepted; the runtime has not confirmed the cancellation yet. */
export const stoppingSnapshot = {
  ...runningSnapshot,
  execution: { ...runningSnapshot.execution, status: 'stopping' },
};

const interruptedDelegation: WorkStep = {
  ...delegationStep,
  status: 'interrupted',
  finishedAt: 1789922927480,
  subagentStatus: 'interrupted',
};

export const cancelledSnapshot = {
  ...runningSnapshot,
  execution: {
    ...runningSnapshot.execution,
    status: 'cancelled',
    finishedAt: '2026-09-20T16:48:47.480Z',
  },
  conversation: touched('2026-09-20T16:48:47.484Z'),
  // `activities` keeps the last status the runtime reported; only `work` settles it.
  revision: 15,
  work: { steps: [reasoningStep, toolStep, interruptedDelegation], omittedSteps: 0 },
};

export const failedSnapshot = {
  ...pendingSnapshot,
  execution: {
    ...execution,
    status: 'failed',
    error: 'The runtime could not complete this execution.',
    errorCode: 'runtime_failed',
    startedAt: '2026-09-20T16:48:44.398Z',
    finishedAt: '2026-09-20T16:48:46.020Z',
  },
  conversation: touched('2026-09-20T16:48:46.024Z'),
  revision: 2,
};

export const attachment = {
  fileId: FILE_ID,
  name: 'architecture-cible.pdf',
  kind: 'pdf',
  mediaType: 'application/pdf',
  sizeBytes: 482113,
  available: true,
  delivery: null,
  truncated: false,
};

/** A message of files only: no text, and the conversation keeps its default title. */
export const attachmentsOnlySnapshot = {
  ...pendingSnapshot,
  conversation: {
    ...conversation,
    title: standaloneChat.title,
    titleSource: standaloneChat.titleSource,
  },
  userMessage: '',
  attachments: [attachment],
};

/** Every route of this group checks the session itself, on top of the access token. */
export const SESSION_REVOKED: ApiProblem = {
  status: 401,
  code: 'HTTP_401',
  message: 'Stream authentication required',
  when: 'The access token is still valid but its session was signed out or revoked, or the account was disabled. Execution routes check this on every call. Sign in again; refreshing will not help.',
};

/**
 * Every route of this group resolves the owner scope (`TenantsService.scopeFor`) after the session
 * check, which already refuses an account that is not active: only a change in between gets here.
 */
export const ACCOUNT_GONE_MEANWHILE: ApiProblem = {
  ...PROBLEM.accountUnavailable,
  when: 'The account was disabled or deleted between the session check of this call and the read of its data. A later call answers "Stream authentication required". Retrying cannot succeed.',
};

/** The `401` answers of every JSON route of the `executions` tag, said once. */
export const EXECUTION_PRIVATE_PROBLEMS: readonly ApiProblem[] = [
  ...PROBLEM.session,
  SESSION_REVOKED,
  ACCOUNT_GONE_MEANWHILE,
];

export const EXECUTION_NOT_FOUND: ApiProblem = PROBLEM.notFound('execution');

/** Answered for an execution that exists, when the conversation behind it is out of reach. */
export const EXECUTION_CONVERSATION_GONE: ApiProblem = {
  ...PROBLEM.notFound('conversation'),
  when: 'The execution is yours but its conversation is no longer reachable: its project was archived or is being deleted.',
};

/** The two refusals of a project that stopped accepting writes, worded for the route. */
export const projectNotWritable = (when: string): readonly ApiProblem[] => [
  { ...PROBLEM.projectArchived, when },
  { ...PROBLEM.projectDeleting, when },
];

export const BINDING_CHANGED: ApiProblem = {
  status: 409,
  code: 'execution_binding_changed',
  message: 'Execution binding is no longer active.',
  when: 'The conversation was bound to another runtime thread after this execution started, so it can no longer be observed or stopped. Do not retry; read the transcript with `GET /api/conversations/{id}/messages`.',
};

export const RECOVERY_REQUIRED: ApiProblem = {
  status: 409,
  code: 'runtime_recovery_required',
  message: 'The saved stream needs recovery.',
  when: 'The saved projection of this execution is inconsistent and cannot be presented. Retrying does not help; the transcript (`GET /api/conversations/{id}/messages`) stays readable.',
};
