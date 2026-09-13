import { z } from 'zod/mini';

import { successEnvelopeSchema } from './envelope';

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
    createdAt: isoDateTime,
    startedAt: z.nullable(isoDateTime),
    finishedAt: z.nullable(isoDateTime),
  }),
);
export type Execution = z.infer<typeof executionSchema>;

export const startExecutionInputSchema = z.object({
  message: z.string().check(z.trim(), z.minLength(1), z.maxLength(EXECUTION_MESSAGE_MAX_LENGTH)),
});
export type StartExecutionInput = z.infer<typeof startExecutionInputSchema>;

/**
 * SSE event name carrying the product execution lifecycle. Every other event name on the stream is
 * a native LangGraph stream event relayed unchanged (`metadata`, `messages/partial`, `updates`, …).
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
}
