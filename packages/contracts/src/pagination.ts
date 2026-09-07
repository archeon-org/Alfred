import { z } from 'zod/mini';

import { successEnvelopeSchema } from './envelope';

const limitInput = z.union([z.number(), z.string().check(z.regex(/^[0-9]+$/u))]);

export const listQuerySchema = z.object({
  cursor: z.optional(z.string().check(z.maxLength(512))),
  limit: z._default(
    z.pipe(
      limitInput,
      z.coerce.number<string | number>().check(z.int(), z.minimum(1), z.maximum(100)),
    ),
    20,
  ),
});

export function listEnvelopeSchema<T extends z.ZodMiniType>(item: T) {
  return successEnvelopeSchema(
    z.object({ items: z.array(item), nextCursor: z.nullable(z.string()) }),
  );
}
