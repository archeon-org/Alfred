import { QueryFailedError, type SelectQueryBuilder } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { encodeCursor } from '@api/common/pagination/cursor';
import { paginateConversations } from '@api/modules/conversations/infrastructure/persistence/paginate-conversations';
import type { ConversationEntity } from '@api/modules/conversations/infrastructure/persistence/conversation.entity';
import { conversationRow } from '../../../../../support/project-fixtures';

function builder(
  result = { entities: [] as ConversationEntity[], raw: [] as { cursor_created: string }[] },
) {
  const query = {
    clone: vi.fn(),
    andWhere: vi.fn(),
    orderBy: vi.fn(),
    addOrderBy: vi.fn(),
    addSelect: vi.fn(),
    take: vi.fn(),
    getRawAndEntities: vi.fn().mockResolvedValue(result),
  };
  for (const method of ['clone', 'andWhere', 'orderBy', 'addOrderBy', 'addSelect', 'take'] as const)
    query[method].mockReturnValue(query);
  return { query, typed: query as unknown as SelectQueryBuilder<ConversationEntity> };
}

describe('conversation cursor pagination', () => {
  it('preserves timestamp microseconds and the pinned bucket in the boundary', async () => {
    const row = conversationRow({ pinnedAt: new Date() });
    const timestamp = '2026-09-10T00:00:00.123456Z';
    const { typed, query } = builder({
      entities: [row, conversationRow()],
      raw: [{ cursor_created: timestamp }, { cursor_created: timestamp }],
    });
    const page = await paginateConversations(typed, { limit: 1 });
    expect(page.nextCursor).toBe(encodeCursor({ id: row.id, sortValue: `1|${timestamp}` }));
    await paginateConversations(typed, { cursor: page.nextCursor!, limit: 1 });
    expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining('pinned_at'), {
      cursorPinned: true,
      cursorCreated: timestamp,
      cursorId: row.id,
    });
  });

  it('returns an empty terminal page and requests eleven rows by default', async () => {
    const { typed, query } = builder();
    expect(await paginateConversations(typed, {})).toEqual({ items: [], nextCursor: null });
    expect(query.take).toHaveBeenCalledWith(11);
  });

  it('rejects malformed boundaries and invalid limits before querying', async () => {
    const { typed, query } = builder();
    for (const cursor of [
      'bad',
      encodeCursor({ id: conversationRow().id, sortValue: '2|2026-09-10T00:00:00.000000Z' }),
      encodeCursor({ id: conversationRow().id, sortValue: '0|garbage' }),
    ]) {
      await expect(paginateConversations(typed, { cursor })).rejects.toMatchObject({
        code: 'invalid_cursor',
      });
    }
    for (const limit of [0, 101, 1.5])
      await expect(paginateConversations(typed, { limit })).rejects.toMatchObject({
        code: 'validation_error',
      });
    expect(query.getRawAndEntities).not.toHaveBeenCalled();
  });

  it('reports malformed SQL dates as invalid cursors without hiding unrelated DB failures', async () => {
    const { typed, query } = builder();
    const cursor = encodeCursor({
      id: conversationRow().id,
      sortValue: '0|2026-02-31T00:00:00.000000Z',
    });
    const invalidDate = new QueryFailedError(
      'select',
      [],
      Object.assign(new Error('invalid date'), { code: '22008' }),
    );
    query.getRawAndEntities.mockRejectedValueOnce(invalidDate);
    await expect(paginateConversations(typed, { cursor })).rejects.toMatchObject({
      code: 'invalid_cursor',
    });
    const unavailable = new Error('Database unavailable');
    query.getRawAndEntities.mockRejectedValueOnce(unavailable);
    await expect(paginateConversations(typed, {})).rejects.toBe(unavailable);
  });
});
