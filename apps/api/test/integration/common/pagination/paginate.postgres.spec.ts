import { randomUUID } from 'node:crypto';
import { DataSource, EntitySchema } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from '@api/common/pagination/cursor';
import { paginateByCursor } from '@api/common/pagination/paginate';

interface Row {
  id: string;
  owner: string;
  updatedAt: Date;
  title: string;
}
const table = `pagination_${randomUUID().replaceAll('-', '')}`;
const entity = new EntitySchema<Row>({
  name: 'PaginationRow',
  tableName: table,
  columns: {
    id: { type: 'uuid', primary: true },
    owner: { type: 'text' },
    updatedAt: { name: 'updated_at', type: 'timestamptz' },
    title: { type: 'text' },
  },
});
const url = process.env.TEST_MIGRATION_DATABASE_URL;

describe.skipIf(url === undefined)('cursor pagination PostgreSQL', () => {
  const db = new DataSource({
    type: 'postgres',
    url,
    entities: [entity],
    synchronize: false,
    migrationsRun: false,
    installExtensions: false,
  });
  const query = () =>
    db
      .getRepository(entity)
      .createQueryBuilder('row')
      .where('row.owner = :owner', { owner: 'alice' });
  beforeAll(async () => {
    await db.initialize();
    await db.query(`CREATE TABLE "${table}" (
      id uuid PRIMARY KEY, owner text NOT NULL, updated_at timestamptz NOT NULL, title text NOT NULL
    )`);
  });
  beforeEach(async () => {
    await db.query(`DELETE FROM "${table}"`);
    // Paired timestamps with microseconds and reverse id ordering expose Date truncation.
    await db.query(`INSERT INTO "${table}" (id, owner, updated_at, title)
      SELECT ('00000000-0000-4000-8000-' || lpad((100 - n)::text, 12, '0'))::uuid,
        'alice', '2026-09-07T12:00:00.123000Z'::timestamptz
          + (n / 2) * interval '1 microsecond', 'title-' || n
      FROM generate_series(1, 45) AS n`);
    await db.query(`INSERT INTO "${table}" VALUES ($1, 'bob', now(), 'private')`, [randomUUID()]);
  });
  afterAll(async () => {
    if (db.isInitialized) {
      try {
        await db.query(`DROP TABLE IF EXISTS "${table}"`);
      } finally {
        await db.destroy();
      }
    }
  });

  it.each(['ASC', 'DESC'] as const)(
    'returns all 45 rows exactly once in %s order',
    async (sortDirection) => {
      const expected = await query()
        .orderBy('row.updatedAt', sortDirection)
        .addOrderBy('row.id', sortDirection)
        .getMany();
      const ids: string[] = [];
      const sizes: number[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 4; page += 1) {
        const result = await paginateByCursor(query(), {
          sortColumn: 'updated_at',
          sortDirection,
          limit: 20,
          cursor,
        });
        sizes.push(result.items.length);
        ids.push(...result.items.map(({ id }) => id));
        if (result.nextCursor === null) break;
        expect(decodeCursor(result.nextCursor)?.id).toBe(result.items.at(-1)?.id);
        cursor = result.nextCursor;
      }
      expect(sizes).toEqual([20, 20, 5]);
      expect(ids).toEqual(expected.map(({ id }) => id));
      expect(new Set(ids).size).toBe(45);
    },
  );

  it('returns null for empty and exact-size final pages, preserving the supplied query', async () => {
    const builder = query();
    const sql = builder.getQueryAndParameters();
    expect(
      (await paginateByCursor(builder, { sortColumn: 'updatedAt', limit: 45 })).nextCursor,
    ).toBeNull();
    expect(builder.getQueryAndParameters()).toEqual(sql);
    expect(await paginateByCursor(query().andWhere('false'), { sortColumn: 'updated_at' })).toEqual(
      { items: [], nextCursor: null },
    );
  });

  it('maps invalid timestamp cursors to 400 invalid_cursor', async () => {
    const cursor = encodeCursor({ id: randomUUID(), sortValue: 'not-a-timestamp' });
    await expect(
      paginateByCursor(query(), { sortColumn: 'updated_at', cursor }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'invalid_cursor' } });
  });

  it('rejects partial selections instead of returning an incorrect page', async () => {
    await expect(
      paginateByCursor(query().select(['row.id']), { sortColumn: 'updated_at' }),
    ).rejects.toThrow('complete entity selection');
  });

  it('preserves microseconds when the database session uses a non-UTC timezone', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await runner.query("SET TIME ZONE 'Asia/Kolkata'");
      const builder = query().setQueryRunner(runner);
      const page = await paginateByCursor(builder, { sortColumn: 'updated_at', limit: 1 });
      const boundary = decodeCursor(page.nextCursor!);
      expect(boundary?.sortValue).toBe('2026-09-07T12:00:00.123022Z');
      expect(boundary?.id).toBe(page.items[0]?.id);
      const next = await paginateByCursor(builder, {
        sortColumn: 'updated_at',
        limit: 1,
        cursor: page.nextCursor!,
      });
      expect(next.items[0]?.id).not.toBe(page.items[0]?.id);
    } finally {
      await runner.query('RESET TIME ZONE');
      await runner.release();
    }
  });

  it('binds text cursor values as data and permits only metadata columns', async () => {
    const cursor = encodeCursor({ id: randomUUID(), sortValue: "'; DROP TABLE users; --" });
    await expect(paginateByCursor(query(), { sortColumn: 'title', cursor })).resolves.toBeDefined();
    await expect(
      paginateByCursor(query(), { sortColumn: 'updated_at); SELECT pg_sleep(5)--' }),
    ).rejects.toThrow('sort column');
    expect(await query().getCount()).toBe(45);
  });
});
