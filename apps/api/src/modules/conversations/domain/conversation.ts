import {
  DEFAULT_CONVERSATION_TITLE,
  type Conversation,
  type ConversationTitleSource,
  type ProjectKind,
} from '@alfred/contracts';

export const CONVERSATION_RESOURCE = 'conversation';

/** Persistence-neutral view of a conversation row. */
export interface ConversationRecord {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly titleSource: ConversationTitleSource;
  readonly pinnedAt: Date | null;
  readonly lastActivityAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
}

export function initialTitle(title: string | undefined): {
  readonly title: string;
  readonly titleSource: ConversationTitleSource;
} {
  const trimmed = title?.trim();
  return trimmed === undefined || trimmed.length === 0
    ? { title: DEFAULT_CONVERSATION_TITLE, titleSource: 'none' }
    : { title: trimmed, titleSource: 'user' };
}

/** Public DTO; `projectKind` lets the client separate standalone chats from project chats. */
export function toConversationDto(
  record: ConversationRecord,
  projectKind: ProjectKind,
): Conversation {
  return Object.freeze({
    archivedAt: record.archivedAt === null ? null : record.archivedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    lastActivityAt: record.lastActivityAt === null ? null : record.lastActivityAt.toISOString(),
    pinnedAt: record.pinnedAt === null ? null : record.pinnedAt.toISOString(),
    projectId: record.projectId,
    projectKind,
    title: record.title,
    titleSource: record.titleSource,
    updatedAt: record.updatedAt.toISOString(),
  });
}
