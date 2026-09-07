import { BadRequestException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { ApiException } from '../errors/api.exception';
import { decodeCursor, encodeCursor } from './cursor';

interface PaginationOptions {
  readonly sortColumn: string;
  readonly sortDirection?: 'ASC' | 'DESC';
  readonly cursor?: string;
  readonly limit?: number;
}

// Non-null scalar columns only: nullable/array/JSON values need a different ordering contract.
const sortableTypes = new Set<unknown>([
  String,
  Number,
  Date,
  'text',
  'varchar',
  'character varying',
  'uuid',
  'int',
  'integer',
  'int2',
  'smallint',
  'int4',
  'int8',
  'bigint',
  'numeric',
  'decimal',
  'timestamp',
  'timestamp without time zone',
  'timestamptz',
  'timestamp with time zone',
  'date',
]);

function invalidCursor(): ApiException {
  return new ApiException(400, 'invalid_cursor', 'Invalid pagination cursor.');
}

function columnsFor<T extends ObjectLiteral>(query: SelectQueryBuilder<T>, sortColumn: string) {
  const metadata = query.expressionMap.mainAlias?.metadata;
  const sort = metadata?.columns.find(
    (column) => column.databaseName === sortColumn || column.propertyPath === sortColumn,
  );
  const id = metadata?.primaryColumns[0];
  if (
    !sort ||
    sort.isNullable ||
    sort.isArray ||
    sort.isVirtualProperty ||
    sort.isSelect === false ||
    !sortableTypes.has(sort.type)
  ) {
    throw new Error('Unsupported pagination sort column');
  }
  if (
    metadata?.primaryColumns.length !== 1 ||
    !id ||
    id.databaseName !== 'id' ||
    id.type !== 'uuid'
  ) {
    throw new Error('Pagination requires a single UUID id primary key');
  }
  const qualified = (name: string) => `${query.escape(query.alias)}.${query.escape(name)}`;
  const sortSql = qualified(sort.databaseName);
  // PostgreSQL text projection avoids the pg driver's millisecond-only Date conversion.
  const timestamp =
    sort.type === Date || sort.type === 'timestamp' || sort.type === 'timestamp without time zone';
  const timestampTz = sort.type === 'timestamptz' || sort.type === 'timestamp with time zone';
  const valueSql =
    timestamp || timestampTz
      ? `to_char(${sortSql}${timestampTz ? " AT TIME ZONE 'UTC'" : ''}, 'YYYY-MM-DD"T"HH24:MI:SS.US${timestampTz ? '"Z"' : ''}')`
      : `CAST(${sortSql} AS text)`;
  return { sortSql, idSql: qualified(id.databaseName), valueSql };
}

/** Paginate a complete entity selection with one row per entity. Keep ownership filters on the caller's query.
 * Joins/aggregation are deliberately unsupported; use EXISTS for related-resource filters.
 * Sort values must fit the 512-character cursor contract. Ordering assumes stable sort values.
 */
export async function paginateByCursor<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  options: PaginationOptions,
): Promise<{ items: T[]; nextCursor: string | null }> {
  const limit = options.limit === undefined ? 20 : options.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new BadRequestException('Limit must be an integer between 1 and 100.');
  }
  const direction = options.sortDirection === undefined ? 'DESC' : options.sortDirection;
  if (direction !== 'ASC' && direction !== 'DESC')
    throw new Error('Unsupported pagination sort direction');
  const cursor = options.cursor === undefined ? null : decodeCursor(options.cursor);
  if (options.cursor !== undefined && cursor === null) throw invalidCursor();
  if (
    queryBuilder.connection.options.type !== 'postgres' ||
    queryBuilder.expressionMap.joinAttributes.length > 0 ||
    queryBuilder.expressionMap.groupBys.length > 0
  ) {
    throw new Error('Pagination requires an unjoined PostgreSQL entity query');
  }
  const { sortSql, idSql, valueSql } = columnsFor(queryBuilder, options.sortColumn);
  if (
    Object.keys(queryBuilder.getParameters()).some((key) => key.startsWith('__pagination_')) ||
    queryBuilder.expressionMap.selects.some(({ aliasName }) =>
      aliasName?.startsWith('__pagination_'),
    )
  ) {
    throw new Error('The __pagination_ prefix is reserved for pagination');
  }
  if (
    queryBuilder.expressionMap.selects.length !== 1 ||
    queryBuilder.expressionMap.selects[0]?.selection !== queryBuilder.alias
  ) {
    throw new Error('Pagination requires a complete entity selection');
  }
  const query = queryBuilder.clone();
  if (cursor !== null) {
    query.andWhere(
      `(${sortSql}, ${idSql}) ${direction === 'DESC' ? '<' : '>'} (:__pagination_sort, :__pagination_id)`,
      {
        __pagination_sort: cursor.sortValue,
        __pagination_id: cursor.id,
      },
    );
  }
  query
    .orderBy(sortSql, direction)
    .addOrderBy(idSql, direction)
    .addSelect(valueSql, '__pagination_sort')
    .addSelect(idSql, '__pagination_id')
    .limit(undefined)
    .offset(undefined)
    .skip(undefined)
    .take(limit + 1);
  let result: { entities: T[]; raw: { __pagination_sort: string; __pagination_id: string }[] };
  try {
    result = await query.getRawAndEntities<{
      __pagination_sort: string;
      __pagination_id: string;
    }>();
  } catch (error) {
    const driverError: unknown = error instanceof QueryFailedError ? error.driverError : null;
    if (
      cursor !== null &&
      typeof driverError === 'object' &&
      driverError !== null &&
      'code' in driverError &&
      ['22P02', '22007', '22008', '22003'].includes(String(driverError.code))
    ) {
      throw invalidCursor();
    }
    throw error;
  }
  if (result.raw.length !== result.entities.length) {
    throw new Error('Pagination requires one raw row per entity');
  }
  const items = result.entities.slice(0, limit);
  if (result.entities.length <= limit) return { items, nextCursor: null };
  const last = result.raw[limit - 1];
  if (!last) throw new Error('Missing pagination boundary row');
  return {
    items,
    nextCursor: encodeCursor({ sortValue: last.__pagination_sort, id: last.__pagination_id }),
  };
}
