import { z } from 'zod/mini';

import { successEnvelopeSchema } from './envelope';
import { conversationSchema } from './conversations';

/** UTF-16 length bound of one submitted chat message; the API enforces the UTF-8 byte bound. */
export const EXECUTION_MESSAGE_MAX_LENGTH = 16_384;

const isoDateTime = z.iso.datetime();

export const messageRoleSchema = z.enum(['user', 'assistant']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const executionStatusSchema = z.enum([
  'pending',
  'running',
  'recovering',
  'stopping',
  'interrupted',
  'recovery_required',
  'timed_out',
  'completed',
  'failed',
  'cancelled',
]);
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;

/** One submitted chat request (ALF-DEC-033). Runtime thread and run identifiers stay private. */
export const executionSchema = z.readonly(
  z.object({
    id: z.uuid(),
    conversationId: z.uuid(),
    status: executionStatusSchema,
    error: z.nullable(z.string()),
    errorCode: z.optional(z.nullable(z.string().check(z.maxLength(80)))),
    createdAt: isoDateTime,
    startedAt: z.nullable(isoDateTime),
    finishedAt: z.nullable(isoDateTime),
  }),
);
export type Execution = z.infer<typeof executionSchema>;

export const startExecutionInputSchema = z.object({
  message: z.string().check(z.trim(), z.minLength(1), z.maxLength(EXECUTION_MESSAGE_MAX_LENGTH)),
  submissionId: z.uuid(),
});
export type StartExecutionInput = z.infer<typeof startExecutionInputSchema>;

/** One parsed SSE frame: the event name, its decoded payload and the opaque cursor if any. */
export interface ExecutionStreamEvent {
  readonly event: string;
  readonly data: unknown;
  readonly id?: string;
}

/**
 * Transport-only SSE frame written beside the AG-UI `data:` frames when observation must be
 * re-established. Its payload is `{ code }` only; it is not an AG-UI event and carries no content.
 */
export const EXECUTION_STREAM_ERROR_EVENT = 'error';
export const EXECUTION_STREAM_UNAVAILABLE_CODE = 'execution_stream_unavailable';

export const EXECUTION_JSON_PROFILE = 'application/vnd.alfred.execution+json;version=1';
export const EXECUTION_OUTPUT_MAX_LENGTH = 262_144;

/**
 * Outcome of one step of the work: `interrupted` is a step still running when its execution
 * settled (Stop, deadline, failure); the runtime never reports it as such.
 */
export const workStepStatusSchema = z.enum(['running', 'completed', 'failed', 'interrupted']);
export type WorkStepStatus = z.infer<typeof workStepStatusSchema>;

export const EXECUTION_WORK_LABEL_MAX_LENGTH = 160;

export const executionActivitySchema = z.readonly(
  z.object({
    id: z.string().check(z.minLength(1), z.maxLength(128)),
    label: z.string().check(z.maxLength(EXECUTION_WORK_LABEL_MAX_LENGTH)),
    status: workStepStatusSchema,
  }),
);
export type ExecutionActivity = z.infer<typeof executionActivitySchema>;

/**
 * Sanitized tool outcome carried as the `content` of an AG-UI `TOOL_CALL_RESULT` event. Raw tool
 * bodies never cross the product boundary (ALF-DEC-037); only the bounded status word does.
 */
export const EXECUTION_TOOL_RESULT_CONTENTS = Object.freeze([
  'completed',
  'failed',
  'interrupted',
] as const);

/** Steps of one execution's work log; the answer itself is not a step. */
export const EXECUTION_WORK_MAX_STEPS = 1024;
/**
 * AG-UI `CUSTOM` event of the observation profile carrying `{ omittedSteps }`: how many steps the
 * work log counted without recording them, emitted on attach when non-zero and whenever it grows,
 * so a live log never reads as exhaustive when the JSON read reports omissions.
 */
export const EXECUTION_WORK_OMITTED_EVENT = 'alfred.work.omitted';
/** Narration text (an intermediate assistant message) is bounded in the JSON profile only. */
export const EXECUTION_WORK_TEXT_MAX_LENGTH = 4_000;

/**
 * One step of the work Alfred did for an answer (ALF-DEC-006 §6, ALF-DEC-037): an intermediate
 * assistant `message` (the orchestrator's, or a specialist's when nested), a `reasoning` marker
 * (with its text only when the deployment exposes reasoning content), a `tool` call, a
 * `delegation` to a specialist through the runtime's delegation tool, a `subagent` seen at work
 * before its delegation could be identified, or an empty `generation`. Nested steps name their
 * parent; timestamps are server milliseconds. Labels are sanitized runtime names; tool arguments,
 * results and specialist prompts never appear.
 */
export const workStepKindSchema = z.enum([
  'message',
  'reasoning',
  'tool',
  'delegation',
  'subagent',
  /** A model round trip that produced neither text, tool call nor reasoning. */
  'generation',
]);
export type WorkStepKind = z.infer<typeof workStepKindSchema>;

/** Reasoning text kept per marker when the deployment exposes reasoning content. */
export const EXECUTION_REASONING_MAX_LENGTH = 32_768;

const workStepIdSchema = z.string().check(z.minLength(1), z.maxLength(128));
const epochMs = z.number().check(z.int(), z.minimum(0));

export const workStepSchema = z.readonly(
  z.object({
    id: workStepIdSchema,
    kind: workStepKindSchema,
    label: z.string().check(z.maxLength(EXECUTION_WORK_LABEL_MAX_LENGTH)),
    status: workStepStatusSchema,
    startedAt: epochMs,
    finishedAt: z.nullable(epochMs),
    parentId: z.optional(workStepIdSchema),
    specialist: z.optional(z.string().check(z.maxLength(EXECUTION_WORK_LABEL_MAX_LENGTH))),
    /** Lifecycle of the specialist invoked by a delegation, once its work was observed. */
    subagentStatus: z.optional(workStepStatusSchema),
    text: z.optional(z.string().check(z.maxLength(EXECUTION_WORK_TEXT_MAX_LENGTH))),
  }),
);
export type WorkStep = z.infer<typeof workStepSchema>;

export const executionWorkSchema = z.readonly(
  z.object({
    steps: z.array(workStepSchema).check(z.maxLength(EXECUTION_WORK_MAX_STEPS)),
    /** Steps the projection stopped recording once its bound was reached. */
    omittedSteps: z.number().check(z.int(), z.minimum(0)),
  }),
);
export type ExecutionWork = z.infer<typeof executionWorkSchema>;

/** Compact account of an answer's work, served with its stored transcript row. */
export const executionWorkSummarySchema = z.readonly(
  z.object({
    status: executionStatusSchema,
    durationMs: z.nullable(epochMs),
    steps: z.number().check(z.int(), z.minimum(0)),
    tools: z.number().check(z.int(), z.minimum(0)),
    delegations: z.number().check(z.int(), z.minimum(0)),
    failedSteps: z.number().check(z.int(), z.minimum(0)),
  }),
);
export type ExecutionWorkSummary = z.infer<typeof executionWorkSummarySchema>;

/** One visible transcript turn owned by the product store (ALF-DEC-007). */
export const messageSchema = z.readonly(
  z.object({
    id: z.uuid(),
    conversationId: z.uuid(),
    executionId: z.nullable(z.uuid()),
    role: messageRoleSchema,
    content: z.string(),
    createdAt: isoDateTime,
    // Added 2026-09-16 for assistant rows; absent from older APIs and from user rows.
    work: z.optional(executionWorkSummarySchema),
  }),
);
export type Message = z.infer<typeof messageSchema>;

export const messageListEnvelopeSchema = successEnvelopeSchema(
  z.object({ items: z.array(messageSchema) }),
);

/**
 * Alfred-owned state carried by AG-UI `STATE_SNAPSHOT` events on `GET /executions/:id/events`.
 * The AG-UI `threadId` is the Conversation id and the `runId` is the Execution id
 * (ALF-DEC-032/033); native runtime identifiers never appear on the wire.
 */
export const alfredRunStateSchema = z.readonly(
  z.object({
    execution: executionSchema,
    conversation: conversationSchema,
    userMessage: z.string().check(z.maxLength(EXECUTION_MESSAGE_MAX_LENGTH)),
  }),
);
export type AlfredRunState = z.infer<typeof alfredRunStateSchema>;

/** Public cumulative projection returned by the JSON commands. Private coordinates stay inside. */
export const executionSnapshotSchema = z.readonly(
  z.object({
    execution: executionSchema,
    conversation: conversationSchema,
    userMessage: z.string().check(z.maxLength(EXECUTION_MESSAGE_MAX_LENGTH)),
    assistantText: z.string().check(z.maxLength(EXECUTION_OUTPUT_MAX_LENGTH)),
    activities: z.array(executionActivitySchema).check(z.maxLength(EXECUTION_WORK_MAX_STEPS)),
    cursor: z.nullable(z.string().check(z.maxLength(4096))),
    revision: z.number().check(z.int(), z.minimum(0)),
    // Added 2026-09-16: the work log behind the answer; absent from older APIs.
    work: z.optional(executionWorkSchema),
  }),
);
export type ExecutionSnapshot = z.infer<typeof executionSnapshotSchema>;
export const executionSnapshotEnvelopeSchema = successEnvelopeSchema(
  z.object({
    snapshot: executionSnapshotSchema,
  }),
);
export const activeExecutionEnvelopeSchema = successEnvelopeSchema(
  z.object({
    snapshot: z.nullable(executionSnapshotSchema),
  }),
);

/**
 * Development diagnostic: the address of an execution's trace in the observability console of the
 * runtime (ALF-DEC-008 observability-only trace). Served only while `traceLinks` is enabled.
 */
/** A web address that carries no credentials: `https://user:secret@host` is refused. */
export function isCredentialFreeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

/** The longest trace link the API serves and the browser opens. */
export const EXECUTION_TRACE_LINK_MAX_LENGTH = 2048;

export const executionTraceLinkSchema = z.readonly(
  z.object({
    url: z
      .url({ protocol: /^https?$/u })
      .check(
        z.maxLength(EXECUTION_TRACE_LINK_MAX_LENGTH),
        z.refine(isCredentialFreeUrl, 'URL must not carry credentials'),
      ),
  }),
);
export type ExecutionTraceLink = z.infer<typeof executionTraceLinkSchema>;
export const executionTraceLinkEnvelopeSchema = successEnvelopeSchema(executionTraceLinkSchema);
