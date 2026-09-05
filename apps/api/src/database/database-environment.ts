import { z } from 'zod';

const booleanFromEnvironment = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const containsCommittedPlaceholder = (value: string): boolean =>
  value.toLowerCase().includes('replace-with');

const databaseEnvironmentSchema = z
  .object({
    DATABASE_POOL_MAX: z.coerce.number().int().min(2).max(100).default(20),
    DATABASE_SSL: booleanFromEnvironment.default(false),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
        message: 'DATABASE_URL must use the PostgreSQL protocol',
      }),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === 'production' &&
      containsCommittedPlaceholder(environment.DATABASE_URL)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Committed placeholder credentials are forbidden in production',
        path: ['DATABASE_URL'],
      });
    }
  });

export type DatabaseEnvironment = Readonly<z.infer<typeof databaseEnvironmentSchema>>;

export function parseDatabaseEnvironment(input: Record<string, unknown>): DatabaseEnvironment {
  return Object.freeze(databaseEnvironmentSchema.parse(input));
}
