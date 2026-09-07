import { QueryFailedError } from 'typeorm';
import type { SelectQueryBuilder } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { decodeCursor, encodeCursor } from '@api/common/pagination/cursor';
import { paginateByCursor } from '@api/common/pagination/paginate';

interface Row {
  id: string;
  updatedAt: Date;
}
const rows = Array.from({ length: 3 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  updatedAt: new Date('2026-09-07T12:00:00.123Z'),
}));

function fixture(sortOverrides: Record<string, unknown> = {}) {
  const builder = {
    alias: 'row',
    expressionMap: {
      mainAlias: {
        metadata: {
          columns: [
            {
              databaseName: 'updated_at',
              propertyPath: 'updatedAt',
              type: 'timestamptz',
              isNullable: false,
              ...sortOverrides,
            },
            { databaseName: 'id', propertyPath: 'id', type: 'uuid', isPrimary: true },
          ],
          primaryColumns: [{ databaseName: 'id', propertyPath: 'id', type: 'uuid' }],
        },
      },
      joinAttributes: [],
      groupBys: [],
      selects: [{ selection: 'row' }],
      wheres: [],
    },
    connection: { options: { type: 'postgres' } },
    escape: (name: string) => `"${name}"`,
    getParameters: vi.fn().mockReturnValue({ owner: 'alice' }),
    clone: vi.fn(),
    andWhere: vi.fn(),
    orderBy: vi.fn(),
    addOrderBy: vi.fn(),
    addSelect: vi.fn(),
    take: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    getRawAndEntities: vi.fn().mockResolvedValue({
      entities: rows,
      raw: rows.map((row, i) => ({
        __pagination_id: row.id,
        __pagination_sort: `2026-09-07T12:00:00.12300${i + 1}Z`,
      })),
    }),
  };
  for (const name of [
    'clone',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'addSelect',
    'take',
    'skip',
    'limit',
    'offset',
  ] as const) {
    builder[name].mockReturnValue(builder);
  }
  return { builder, query: builder as unknown as SelectQueryBuilder<Row> };
}

describe('paginateByCursor', () => {
  it.each([
    { isNullable: true },
    { isArray: true },
    { isVirtualProperty: true },
    { isSelect: false },
    { type: 'jsonb' },
  ])('rejects unsortable or hidden metadata columns: %j', async (overrides) => {
    const { query } = fixture(overrides);
    await expect(paginateByCursor(query, { sortColumn: 'updated_at' })).rejects.toThrow(
      'sort column',
    );
  });

  it('rejects parameters reserved for pagination instead of overwriting caller filters', async () => {
    const { builder, query } = fixture();
    builder.getParameters.mockReturnValue({ __pagination_id: rows[0]!.id });
    await expect(paginateByCursor(query, { sortColumn: 'updated_at' })).rejects.toThrow('reserved');
  });

  it('requires a single UUID id primary key', async () => {
    const { builder } = fixture();
    const badQuery = {
      ...builder,
      expressionMap: {
        ...builder.expressionMap,
        mainAlias: {
          metadata: { ...builder.expressionMap.mainAlias.metadata, primaryColumns: [] },
        },
      },
    } as unknown as SelectQueryBuilder<Row>;
    await expect(paginateByCursor(badQuery, { sortColumn: 'updated_at' })).rejects.toThrow(
      'primary key',
    );
  });

  it('rejects joins that can produce multiple rows per entity', async () => {
    const { builder } = fixture();
    const joined = {
      ...builder,
      expressionMap: { ...builder.expressionMap, joinAttributes: [{}] },
    } as unknown as SelectQueryBuilder<Row>;
    await expect(paginateByCursor(joined, { sortColumn: 'updated_at' })).rejects.toThrow(
      'unjoined',
    );
  });

  it.each(['timestamp', 'timestamp without time zone', 'date', 'text'])(
    'projects %s from the database',
    async (type) => {
      const { builder, query } = fixture({ type });
      await paginateByCursor(query, { sortColumn: 'updated_at' });
      expect(builder.addSelect).toHaveBeenCalledWith(expect.any(String), '__pagination_sort');
    },
  );

  it.each(['22P02', '22007', '22008', '22003'])(
    'maps PostgreSQL cursor format error %s',
    async (code) => {
      const { builder, query } = fixture();
      builder.getRawAndEntities.mockRejectedValue(
        new QueryFailedError('SELECT', [], Object.assign(new Error('bad value'), { code })),
      );
      await expect(
        paginateByCursor(query, {
          sortColumn: 'updated_at',
          cursor: encodeCursor({ id: rows[0]!.id, sortValue: 'bad' }),
        }),
      ).rejects.toMatchObject({ status: 400, response: { code: 'invalid_cursor' } });
    },
  );

  it('rejects inconsistent raw results instead of returning a broken cursor', async () => {
    const { builder, query } = fixture();
    builder.getRawAndEntities.mockResolvedValue({ entities: rows, raw: [] });
    await expect(paginateByCursor(query, { sortColumn: 'updated_at', limit: 2 })).rejects.toThrow(
      'one raw row per entity',
    );
  });

  it('rejects duplicate raw rows even when entities were deduplicated', async () => {
    const { builder, query } = fixture();
    builder.getRawAndEntities.mockResolvedValue({ entities: rows.slice(0, 1), raw: [{}, {}] });
    await expect(paginateByCursor(query, { sortColumn: 'updated_at' })).rejects.toThrow(
      'one raw row per entity',
    );
  });

  it('rejects partial entity selection', async () => {
    const { builder } = fixture();
    const partial = {
      ...builder,
      expressionMap: { ...builder.expressionMap, selects: [{ selection: 'row.updatedAt' }] },
    } as unknown as SelectQueryBuilder<Row>;
    await expect(paginateByCursor(partial, { sortColumn: 'updated_at' })).rejects.toThrow(
      'complete entity selection',
    );
  });

  it('defaults to 20 and signals the last page', async () => {
    const { builder, query } = fixture();
    expect(await paginateByCursor(query, { sortColumn: 'updated_at' })).toEqual({
      items: rows,
      nextCursor: null,
    });
    expect(builder.take).toHaveBeenCalledWith(21);
  });

  it('builds the cursor from the last returned row at raw database precision', async () => {
    const { builder, query } = fixture();
    const page = await paginateByCursor(query, { sortColumn: 'updated_at', limit: 2 });
    expect(page.items).toEqual(rows.slice(0, 2));
    expect(decodeCursor(page.nextCursor!)).toEqual({
      id: rows[1]?.id,
      sortValue: '2026-09-07T12:00:00.123002Z',
    });
    expect(builder.clone).toHaveBeenCalled();
    expect(builder.take).toHaveBeenCalledWith(3);
  });

  it.each(['ASC', 'DESC'] as const)(
    'uses a bound tuple comparison in %s order',
    async (sortDirection) => {
      const { builder, query } = fixture();
      const value = { id: rows[0]!.id, sortValue: '2026-09-07T12:00:00.123001Z' };
      await paginateByCursor(query, {
        sortColumn: 'updatedAt',
        sortDirection,
        cursor: encodeCursor(value),
      });
      expect(builder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining(sortDirection === 'ASC' ? ' > ' : ' < '),
        expect.objectContaining({ __pagination_sort: value.sortValue, __pagination_id: value.id }),
      );
      expect(builder.orderBy).toHaveBeenCalledWith('"row"."updated_at"', sortDirection);
      expect(builder.addOrderBy).toHaveBeenCalledWith('"row"."id"', sortDirection);
    },
  );

  it.each([0, 101, 1.5, NaN, Infinity, null, '20', true])(
    'rejects invalid helper limits: %j',
    async (limit) => {
      const { builder, query } = fixture();
      await expect(
        paginateByCursor(query, { sortColumn: 'updated_at', limit: limit as number }),
      ).rejects.toMatchObject({ status: 400 });
      expect(builder.getRawAndEntities).not.toHaveBeenCalled();
    },
  );

  it.each(['', '!', 'a'.repeat(513)])('rejects invalid cursor before querying', async (cursor) => {
    const { builder, query } = fixture();
    await expect(
      paginateByCursor(query, { sortColumn: 'updated_at', cursor }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'invalid_cursor' },
    });
    expect(builder.getRawAndEntities).not.toHaveBeenCalled();
  });

  it.each(['unknown', 'updated_at DESC; --', 'row.updated_at'])(
    'rejects unlisted sort columns: %s',
    async (sortColumn) => {
      const { builder, query } = fixture();
      await expect(paginateByCursor(query, { sortColumn })).rejects.toThrow('sort column');
      expect(builder.getRawAndEntities).not.toHaveBeenCalled();
    },
  );

  it('rejects unsupported directions before querying', async () => {
    const { query } = fixture();
    await expect(
      paginateByCursor(query, { sortColumn: 'updated_at', sortDirection: 'bad' as 'ASC' }),
    ).rejects.toThrow();
  });

  it('does not disguise operational database failures as invalid cursors', async () => {
    const { builder, query } = fixture();
    const error = new Error('database unavailable');
    builder.getRawAndEntities.mockRejectedValue(error);
    await expect(paginateByCursor(query, { sortColumn: 'updated_at' })).rejects.toBe(error);
  });
});
