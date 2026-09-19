import {
  CONVERSATION_TITLE_MAX_LENGTH,
  type Execution,
  type ExecutionStatus,
  type ExecutionWorkSummary,
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
    error: publicExecutionError(record.error),
    errorCode: record.error === null ? null : safeExecutionErrorCode(record.error),
    finishedAt: record.finishedAt === null ? null : record.finishedAt.toISOString(),
    id: record.id,
    startedAt: record.startedAt === null ? null : record.startedAt.toISOString(),
    status: record.status,
  });
}

export function toMessageDto(record: MessageRecord, work?: ExecutionWorkSummary): Message {
  return Object.freeze({
    content: record.content,
    conversationId: record.conversationId,
    createdAt: record.createdAt.toISOString(),
    executionId: record.executionId,
    id: record.id,
    role: record.role,
    ...(work === undefined ? {} : { work }),
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

const PUBLIC_EXECUTION_ERRORS: Readonly<Record<string, string>> = Object.freeze({
  runtime_output_incomplete: 'The runtime output could not be fully verified.',
  runtime_failed: 'The runtime could not complete this execution.',
  runtime_interrupted: 'The execution requires attention before it can continue.',
  runtime_recovery_gap: 'The runtime replay is unavailable. Saved output remains readable.',
  runtime_event_invalid: 'The runtime output could not be safely processed.',
  runtime_source_id_missing: 'The runtime output cannot be reliably recovered.',
  runtime_projection_limit: 'The execution output exceeded its configured limit.',
  execution_deadline_exceeded: 'The execution reached its time limit.',
  execution_authority_lost:
    'The execution was stopped because its owner or scope is no longer available.',
  superseded: 'A newer message replaced this answer.',
});

function safeExecutionErrorCode(value: string): string {
  return Object.hasOwn(PUBLIC_EXECUTION_ERRORS, value) ? value : 'runtime_failed';
}

function publicExecutionError(value: string | null): string | null {
  return value === null
    ? null
    : (PUBLIC_EXECUTION_ERRORS[safeExecutionErrorCode(value)] ?? 'Runtime execution failed.');
}

/** Never surface provider exception text, including historical rows stored before sanitization. */
export function describeRuntimeError(_error: unknown): string {
  void _error;
  return 'Runtime execution failed.';
}
