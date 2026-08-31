import { z } from 'zod';

const commaSeparatedOrigins = z
  .string()
  .min(1)
  .transform((value) => value.split(',').map((origin) => origin.trim()))
  .pipe(z.array(z.string().url()).min(1));

const environmentSchema = z
  .object({
    API_CORS_ORIGINS: commaSeparatedOrigins.default(['http://localhost:5173']),
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().max(65_535).default(3000),
    API_PREFIX: z
      .string()
      .default('api')
      .transform((value) => value.replace(/^\/+|\/+$/gu, ''))
      .pipe(z.string().min(1)),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
        message: 'DATABASE_URL must use the PostgreSQL protocol',
      }),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && environment.API_CORS_ORIGINS.includes('*')) {
      context.addIssue({
        code: 'custom',
        message: 'API_CORS_ORIGINS cannot contain a wildcard in production',
        path: ['API_CORS_ORIGINS'],
      });
    }
  });

type ParsedEnvironment = z.infer<typeof environmentSchema>;

export type AppEnvironment = Readonly<
  Omit<ParsedEnvironment, 'API_CORS_ORIGINS'> & {
    API_CORS_ORIGINS: readonly string[];
  }
>;

export function parseEnvironment(input: Record<string, unknown>): AppEnvironment {
  const parsed = environmentSchema.parse(input);
  const origins = Object.freeze([...parsed.API_CORS_ORIGINS]);

  return Object.freeze({
    ...parsed,
    API_CORS_ORIGINS: origins,
  });
}
