import { QueryFailedError, type SelectQueryBuilder } from 'typeorm';
import { ApiException } from '../../../../common/errors/api.exception';
import { decodeCursor, encodeCursor } from '../../../../common/pagination/cursor';
import type { ConversationEntity } from './conversation.entity';

interface Options {
  readonly cursor?: string;
  readonly limit?: number;
}

const invalidCursor = () => new ApiException(400, 'invalid_cursor', 'Invalid pagination cursor.');
const timestampPattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/u;

/** Pin priority, then creation recency, then UUID. Pin time does not reorder pinned chats.
 * The raw timestamp preserves PostgreSQL microseconds across page boundaries.
 * As with other keyset lists, a mutation changes ordering; clients must invalidate their list.
 */
export async function paginateConversations(
  builder: SelectQueryBuilder<ConversationEntity>,
  options: Options,
): Promise<{ items: ConversationEntity[]; nextCursor: string | null }> {
  const limit = options.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ApiException(400, 'validation_error', 'Limit must be between 1 and 100.');
  }
  const query = builder.clone();
  const pinned = '("conversation"."pinned_at" IS NOT NULL)';
  const created = '"conversation"."created_at"';
  const id = '"conversation"."id"';
  if (options.cursor !== undefined) {
    const cursor = decodeCursor(options.cursor);
    const [priority, timestamp, ...rest] = cursor?.sortValue.split('|') ?? [];
    if (
      !cursor ||
      !['0', '1'].includes(priority ?? '') ||
      !timestamp ||
      rest.length > 0 ||
      !timestampPattern.test(timestamp) ||
      !Number.isFinite(Date.parse(timestamp))
    ) {
      throw invalidCursor();
    }
    query.andWhere(`(${pinned}, ${created}, ${id}) < (:cursorPinned, :cursorCreated, :cursorId)`, {
      cursorPinned: priority === '1',
      cursorCreated: timestamp,
      cursorId: cursor.id,
    });
  }
  const ordered = query
    .orderBy(pinned, 'DESC')
    .addOrderBy(created, 'DESC')
    .addOrderBy(id, 'DESC')
    .addSelect(
      `to_char(${created} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      'cursor_created',
    )
    .take(limit + 1);
  let result: { entities: ConversationEntity[]; raw: { cursor_created: string }[] };
  try {
    result = await ordered.getRawAndEntities<{ cursor_created: string }>();
  } catch (error) {
    const driverError: unknown = error instanceof QueryFailedError ? error.driverError : null;
    if (
      options.cursor !== undefined &&
      typeof driverError === 'object' &&
      driverError !== null &&
      'code' in driverError &&
      ['22P02', '22007', '22008'].includes(String(driverError.code))
    ) {
      throw invalidCursor();
    }
    throw error;
  }
  const items = result.entities.slice(0, limit);
  const last = items.at(-1);
  const raw = result.raw[limit - 1];
  return {
    items,
    nextCursor:
      result.entities.length > limit && last && raw
        ? encodeCursor({
            id: last.id,
            sortValue: `${last.pinnedAt === null ? '0' : '1'}|${raw.cursor_created}`,
          })
        : null,
  };
}
