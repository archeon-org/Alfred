import { z } from 'zod/mini';

export function successEnvelopeSchema<T extends z.ZodMiniType>(data: T) {
  return z.readonly(z.object({ data, success: z.literal(true) }));
}
