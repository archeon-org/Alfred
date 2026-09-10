import { z } from 'zod';

const booleanFromEnvironment = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const commaSeparatedOrigins = z
  .string()
  .min(1)
  .transform((value) => value.split(',').map((origin) => origin.trim()))
  .pipe(z.array(z.string().url()).min(1));

const emptyStringToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const containsCommittedPlaceholder = (value: string | undefined): boolean =>
  value?.toLowerCase().includes('replace-with') === true;

const usesHttps = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const hasUrlPassword = (value: string): boolean => {
  try {
    return new URL(value).password.length > 0;
  } catch {
    return false;
  }
};

const environmentSchema = z
  .object({
    API_CORS_ORIGINS: commaSeparatedOrigins.prefault('http://localhost:5173'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().positive().max(65_535).default(3000),
    API_PREFIX: z
      .string()
      .default('api')
      .transform((value) => value.replace(/^\/+|\/+$/gu, ''))
      .pipe(z.string().min(1)),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    AUTH_COOKIE_SECURE: booleanFromEnvironment.default(false),
    AUTH_IP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(120).max(1_000_000).default(6_000),
    AUTH_JWT_AUDIENCE: z.string().min(1).default('alfred-web'),
    AUTH_JWT_ISSUER: z.string().min(1).default('alfred-api'),
    AUTH_JWT_SECRET: z.string().min(32),
    AUTH_OAUTH_CALLBACK_IP_RATE_LIMIT_PER_MINUTE: z.coerce
      .number()
      .int()
      .min(1)
      .max(1_000_000)
      .default(600),
    AUTH_OAUTH_START_IP_RATE_LIMIT_PER_MINUTE: z.coerce
      .number()
      .int()
      .min(1)
      .max(1_000_000)
      .default(300),
    AUTH_REFRESH_IP_RATE_LIMIT_PER_MINUTE: z.coerce
      .number()
      .int()
      .min(1)
      .max(1_000_000)
      .default(1_200),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(3600)
      .max(31_536_000)
      .default(2_592_000),
    AUTH_SESSION_CLEANUP_INTERVAL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(86_400)
      .default(3_600),
    AUTH_SESSION_RETENTION_SECONDS: z.coerce
      .number()
      .int()
      .min(0)
      .max(31_536_000)
      .default(2_592_000),
    AUTH_USER_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(100_000).default(120),
    CONTEXT_DOCUMENT_MAX_BYTES: z.coerce.number().int().min(1).max(65_536).default(65_536),
    DATABASE_POOL_MAX: z.coerce.number().int().min(2).max(100).default(20),
    DATABASE_SSL: booleanFromEnvironment.default(false),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
        message: 'DATABASE_URL must use the PostgreSQL protocol',
      }),
    FEATURE_AGENT_RUNTIME_ENABLED: booleanFromEnvironment.default(false),
    FEATURE_AG_UI_STREAMING_ENABLED: booleanFromEnvironment.default(false),
    FEATURE_FILE_UPLOADS_ENABLED: booleanFromEnvironment.default(false),
    FEATURE_GENERATIVE_UI_ENABLED: booleanFromEnvironment.default(false),
    FEATURE_GOOGLE_OAUTH_ENABLED: booleanFromEnvironment.default(false),
    FEATURE_MCP_APPS_ENABLED: booleanFromEnvironment.default(false),
    FEATURE_OUTPUT_STYLES_ENABLED: booleanFromEnvironment.default(false),
    FEATURE_KNOWLEDGE_SCOPE_ENABLED: booleanFromEnvironment.default(false),
    FEATURE_CONVERSATION_FEEDBACK_ENABLED: booleanFromEnvironment.default(false),
    FEATURE_OPENAPI_ENABLED: booleanFromEnvironment.default(true),
    FEATURE_RATE_LIMITING_ENABLED: booleanFromEnvironment.default(true),
    FEATURE_RUNTIME_MEMORY_ENABLED: booleanFromEnvironment.default(false),
    FEATURE_SKILLS_ENABLED: booleanFromEnvironment.default(false),
    FEATURE_TEAMS_ENABLED: booleanFromEnvironment.default(false),
    GOOGLE_OAUTH_CALLBACK_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
    GOOGLE_OAUTH_CLIENT_ID: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    GOOGLE_OAUTH_CLIENT_SECRET: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    GOOGLE_WORKSPACE_DOMAIN: z.preprocess(
      emptyStringToUndefined,
      z
        .string()
        .min(1)
        .transform((value) => value.toLowerCase())
        .optional(),
    ),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    OBSERVABILITY_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    OBSERVABILITY_METRICS_ENABLED: booleanFromEnvironment.default(false),
    OBSERVABILITY_METRICS_TOKEN: z.preprocess(
      emptyStringToUndefined,
      z.string().min(32).optional(),
    ),
    REDIS_URL: z.string().url().default('redis://localhost:6379'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    WEB_APP_URL: z
      .string()
      .url()
      .default('http://localhost:5173')
      .transform((value) => new URL(value).origin),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && environment.API_CORS_ORIGINS.includes('*')) {
      context.addIssue({
        code: 'custom',
        message: 'API_CORS_ORIGINS cannot contain a wildcard in production',
        path: ['API_CORS_ORIGINS'],
      });
    }

    if (
      environment.NODE_ENV === 'production' &&
      environment.API_CORS_ORIGINS.some((origin) => !usesHttps(origin))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'API_CORS_ORIGINS must use HTTPS in production',
        path: ['API_CORS_ORIGINS'],
      });
    }

    if (environment.NODE_ENV === 'production' && !environment.AUTH_COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        message: 'AUTH_COOKIE_SECURE must be true in production',
        path: ['AUTH_COOKIE_SECURE'],
      });
    }

    if (environment.NODE_ENV === 'production' && !environment.WEB_APP_URL.startsWith('https://')) {
      context.addIssue({
        code: 'custom',
        message: 'WEB_APP_URL must use HTTPS in production',
        path: ['WEB_APP_URL'],
      });
    }

    if (environment.NODE_ENV === 'production') {
      const credentials = {
        AUTH_JWT_SECRET: environment.AUTH_JWT_SECRET,
        DATABASE_URL: environment.DATABASE_URL,
        ...(environment.FEATURE_GOOGLE_OAUTH_ENABLED
          ? {
              GOOGLE_OAUTH_CLIENT_ID: environment.GOOGLE_OAUTH_CLIENT_ID,
              GOOGLE_OAUTH_CLIENT_SECRET: environment.GOOGLE_OAUTH_CLIENT_SECRET,
            }
          : {}),
        ...(environment.FEATURE_RATE_LIMITING_ENABLED ? { REDIS_URL: environment.REDIS_URL } : {}),
      } as const;

      for (const [key, value] of Object.entries(credentials)) {
        if (containsCommittedPlaceholder(value)) {
          context.addIssue({
            code: 'custom',
            message: 'Committed placeholder credentials are forbidden in production',
            path: [key],
          });
        }
      }

      if (environment.FEATURE_RATE_LIMITING_ENABLED && !hasUrlPassword(environment.REDIS_URL)) {
        context.addIssue({
          code: 'custom',
          message: 'REDIS_URL must include a password in production',
          path: ['REDIS_URL'],
        });
      }
    }

    if (environment.FEATURE_GOOGLE_OAUTH_ENABLED) {
      const requiredGoogleKeys = [
        'GOOGLE_OAUTH_CLIENT_ID',
        'GOOGLE_OAUTH_CLIENT_SECRET',
        'GOOGLE_OAUTH_CALLBACK_URL',
      ] as const;

      for (const key of requiredGoogleKeys) {
        if (environment[key] === undefined) {
          context.addIssue({
            code: 'custom',
            message: `${key} is required when FEATURE_GOOGLE_OAUTH_ENABLED is true`,
            path: [key],
          });
        }
      }

      if (
        environment.NODE_ENV === 'production' &&
        environment.GOOGLE_OAUTH_CALLBACK_URL !== undefined &&
        !usesHttps(environment.GOOGLE_OAUTH_CALLBACK_URL)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'GOOGLE_OAUTH_CALLBACK_URL must use HTTPS in production',
          path: ['GOOGLE_OAUTH_CALLBACK_URL'],
        });
      }
    }

    if (
      environment.OBSERVABILITY_METRICS_ENABLED &&
      environment.OBSERVABILITY_METRICS_TOKEN === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message: 'OBSERVABILITY_METRICS_TOKEN is required when metrics are enabled',
        path: ['OBSERVABILITY_METRICS_TOKEN'],
      });
    }

    if (environment.AUTH_SESSION_RETENTION_SECONDS < environment.AUTH_REFRESH_TOKEN_TTL_SECONDS) {
      context.addIssue({
        code: 'custom',
        message: 'AUTH_SESSION_RETENTION_SECONDS must be at least AUTH_REFRESH_TOKEN_TTL_SECONDS',
        path: ['AUTH_SESSION_RETENTION_SECONDS'],
      });
    }

    if (environment.AUTH_IP_RATE_LIMIT_PER_MINUTE <= environment.AUTH_USER_RATE_LIMIT_PER_MINUTE) {
      context.addIssue({
        code: 'custom',
        message: 'AUTH_IP_RATE_LIMIT_PER_MINUTE must exceed AUTH_USER_RATE_LIMIT_PER_MINUTE',
        path: ['AUTH_IP_RATE_LIMIT_PER_MINUTE'],
      });
    }

    if (
      environment.NODE_ENV === 'production' &&
      environment.OBSERVABILITY_METRICS_ENABLED &&
      containsCommittedPlaceholder(environment.OBSERVABILITY_METRICS_TOKEN)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Committed placeholder credentials are forbidden in production',
        path: ['OBSERVABILITY_METRICS_TOKEN'],
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
  const origins = Object.freeze(parsed.API_CORS_ORIGINS.map((value) => new URL(value).origin));

  return Object.freeze({
    ...parsed,
    API_CORS_ORIGINS: origins,
  });
}
