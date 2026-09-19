import { z } from 'zod/mini';

import { successEnvelopeSchema } from './envelope';
import { conversationSchema } from './conversations';

/** UTF-16 length bound of one submitted chat message; the API enforces the UTF-8 byte bound. */
export const EXECUTION_MESSAGE_MAX_LENGTH = 16_384;

const isoDateTime = z.iso.datetime();

export const messageRoleSchema = z.enum(['user', 'assistant']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

/** One visible transcript turn owned by the product store (ALF-DEC-007). */
export const messageSchema = z.readonly(
  z.object({
    id: z.uuid(),
    conversationId: z.uuid(),
    executionId: z.nullable(z.uuid()),
    role: messageRoleSchema,
    content: z.string(),
    createdAt: isoDateTime,
  }),
);
export type Message = z.infer<typeof messageSchema>;

export const messageListEnvelopeSchema = successEnvelopeSchema(
  z.object({ items: z.array(messageSchema) }),
);

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

/**
 * Product execution lifecycle event. Native provider payloads are never a public event contract.
 */
export const EXECUTION_SSE_EVENT = 'execution';

/**
 * SSE event name carrying the public Conversation DTO whenever the API changes it during an
 * execution: the provisional title and activity when the first message is sent, then the title
 * produced by the runtime title agent. A user-chosen title is never replaced.
 */
export const CONVERSATION_SSE_EVENT = 'conversation';

export interface ExecutionStreamEvent {
  readonly event: string;
  readonly data: unknown;
  readonly id?: string;
}

export const EXECUTION_SNAPSHOT_SSE_EVENT = 'snapshot';
export const EXECUTION_JSON_PROFILE = 'application/vnd.alfred.execution+json;version=1';
export const EXECUTION_OUTPUT_MAX_LENGTH = 262_144;
export const executionActivitySchema = z.readonly(
  z.object({
    id: z.string().check(z.minLength(1), z.maxLength(128)),
    label: z.string().check(z.maxLength(160)),
    status: z.enum(['running', 'completed', 'failed']),
  }),
);
export type ExecutionActivity = z.infer<typeof executionActivitySchema>;

/** Public cumulative projection. Private source/reducer coordinates stay inside the API. */
export const executionSnapshotSchema = z.readonly(
  z.object({
    execution: executionSchema,
    conversation: conversationSchema,
    userMessage: z.string().check(z.maxLength(EXECUTION_MESSAGE_MAX_LENGTH)),
    assistantText: z.string().check(z.maxLength(EXECUTION_OUTPUT_MAX_LENGTH)),
    activities: z.array(executionActivitySchema).check(z.maxLength(256)),
    cursor: z.nullable(z.string().check(z.maxLength(4096))),
    revision: z.number().check(z.int(), z.minimum(0)),
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

export const EXECUTION_DELTA_SSE_EVENT = 'delta';
/**
 * Incremental public projection. It applies only on top of the last accepted snapshot of the same
 * execution at `baseRevision`; omitted fields are unchanged, `assistantAppend` extends the text and
 * `assistantText` replaces it. Terminal states always arrive as a full snapshot.
 */
export const executionDeltaSchema = z.readonly(
  z.object({
    executionId: z.uuid(),
    baseRevision: z.number().check(z.int(), z.minimum(0)),
    revision: z.number().check(z.int(), z.minimum(0)),
    cursor: z.nullable(z.string().check(z.maxLength(4096))),
    assistantAppend: z.optional(z.string().check(z.maxLength(EXECUTION_OUTPUT_MAX_LENGTH))),
    assistantText: z.optional(z.string().check(z.maxLength(EXECUTION_OUTPUT_MAX_LENGTH))),
    activities: z.optional(z.array(executionActivitySchema).check(z.maxLength(256))),
    execution: z.optional(executionSchema),
    conversation: z.optional(conversationSchema),
  }),
);
export type ExecutionDelta = z.infer<typeof executionDeltaSchema>;

/** Returns the reconstructed snapshot, or null when the delta does not continue `base`. */
export function applyExecutionDelta(
  base: ExecutionSnapshot,
  delta: ExecutionDelta,
): ExecutionSnapshot | null {
  if (
    delta.executionId !== base.execution.id ||
    delta.baseRevision !== base.revision ||
    delta.revision < base.revision
  )
    return null;
  const assistantText =
    delta.assistantText ??
    (delta.assistantAppend === undefined
      ? base.assistantText
      : base.assistantText + delta.assistantAppend);
  if (assistantText.length > EXECUTION_OUTPUT_MAX_LENGTH) return null;
  return {
    execution: delta.execution ?? base.execution,
    conversation: delta.conversation ?? base.conversation,
    userMessage: base.userMessage,
    assistantText,
    activities: delta.activities ?? base.activities,
    cursor: delta.cursor,
    revision: delta.revision,
  };
}
