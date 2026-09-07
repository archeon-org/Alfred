import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/mini';

import { ListQueryDto } from '@api/common/pagination/list-query.dto';
import { listEnvelopeSchema, listQuerySchema } from '@alfred/contracts';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const validate = (value: unknown): Promise<ListQueryDto> =>
  pipe.transform(value, { type: 'query', metatype: ListQueryDto });

describe('list query validation', () => {
  it('defaults to 20 and accepts bounded decimal integer strings', async () => {
    expect(await validate({})).toMatchObject({ limit: 20 });
    expect(listQuerySchema.parse({})).toMatchObject({ limit: 20 });
    for (const limit of [1, 20, 100, '1', '20', '100']) {
      expect(await validate({ limit })).toMatchObject({ limit: Number(limit) });
      expect(listQuerySchema.parse({ limit }).limit).toBe(Number(limit));
    }
  });

  it.each([
    0,
    101,
    -1,
    1.5,
    NaN,
    Infinity,
    '',
    ' ',
    '1.5',
    '1e1',
    '0x10',
    '20x',
    '+20',
    ' 20',
    true,
    false,
    null,
    [],
    ['20'],
    {},
  ])('rejects invalid limits in both boundaries: %j', async (limit) => {
    await expect(validate({ limit })).rejects.toThrow();
    expect(listQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it.each([null, 2, [], 'a'.repeat(513)])('rejects invalid cursor fields: %j', async (cursor) => {
    await expect(validate({ cursor })).rejects.toThrow();
    expect(listQuerySchema.safeParse({ cursor }).success).toBe(false);
  });

  it('validates envelope items and nullable continuation', () => {
    const schema = listEnvelopeSchema(z.object({ id: z.string() }));
    expect(
      schema.parse({ success: true, data: { items: [{ id: 'one' }], nextCursor: null } }),
    ).toEqual({ success: true, data: { items: [{ id: 'one' }], nextCursor: null } });
    expect(
      schema.safeParse({ success: true, data: { items: [{ id: 1 }], nextCursor: null } }).success,
    ).toBe(false);
  });
});
