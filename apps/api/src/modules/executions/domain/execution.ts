import {
  CONVERSATION_TITLE_MAX_LENGTH,
  type Execution,
  type ExecutionStatus,
  type Message,
  type MessageRole,
} from '@alfred/contracts';

export const EXECUTION_RESOURCE = 'execution';

/** Persistence-neutral view of an execution row. Runtime identifiers never reach the DTO. */
export interface ExecutionRecord {
  readonly id: string;
  readonly conversationId: string;
  readonly status: ExecutionStatus;
  readonly error: string | null;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
}

export interface MessageRecord {
  readonly id: string;
  readonly conversationId: string;
  readonly executionId: string | null;
  readonly role: MessageRole;
  readonly content: string;
  readonly createdAt: Date;
}

export function toExecutionDto(record: ExecutionRecord): Execution {
  return Object.freeze({
    conversationId: record.conversationId,
    createdAt: record.createdAt.toISOString(),
    error: record.error,
    finishedAt: record.finishedAt === null ? null : record.finishedAt.toISOString(),
    id: record.id,
    startedAt: record.startedAt === null ? null : record.startedAt.toISOString(),
    status: record.status,
  });
}

export function toMessageDto(record: MessageRecord): Message {
  return Object.freeze({
    content: record.content,
    conversationId: record.conversationId,
    createdAt: record.createdAt.toISOString(),
    executionId: record.executionId,
    id: record.id,
    role: record.role,
  });
}

const AUTO_TITLE_MAX_LENGTH = 80;

/** First line of the first user message, bounded, as the conversation's provisional title. */
export function autoTitle(message: string): string {
  const firstLine = message.split('\n', 1)[0]?.trim() ?? '';
  if (firstLine.length <= AUTO_TITLE_MAX_LENGTH) return firstLine;
  return `${firstLine.slice(0, AUTO_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

const SURROUNDING_QUOTES = /^["'«“„](.*)["'»”“]$/u;

function isPrintable(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code > 0x1f && code !== 0x7f;
}

/**
 * Normalizes a title produced by the runtime title graph into a storable conversation title, or
 * null when it is unusable: a fallback the graph did not derive from the message (`language`
 * null), or nothing left once control characters, extra spaces and surrounding quotes are gone.
 */
export function sanitizeGeneratedTitle(generated: {
  readonly title: string;
  readonly language: string | null;
}): string | null {
  if (generated.language === null) return null;
  const collapsed = [...generated.title]
    .filter(isPrintable)
    .join('')
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .replace(SURROUNDING_QUOTES, '$1')
    .trim();
  if (collapsed.length === 0) return null;
  if (collapsed.length <= CONVERSATION_TITLE_MAX_LENGTH) return collapsed;
  return `${collapsed.slice(0, CONVERSATION_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * An execution still `pending` or `running` after this delay never received its terminal state:
 * the API process died mid-stream. The next request on the conversation closes it as failed instead
 * of leaving the chat busy forever.
 */
export const EXECUTION_ABANDON_AFTER_MS = 15 * 60 * 1000;
export const ABANDONED_EXECUTION_ERROR = 'Execution abandoned: no terminal state was recorded.';

const ERROR_MAX_LENGTH = 512;

/** Bounded, credential-free description of a failed run for the execution row and the DTO. */
export function describeRuntimeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Runtime execution failed.';
  return message.length <= ERROR_MAX_LENGTH ? message : message.slice(0, ERROR_MAX_LENGTH);
}
