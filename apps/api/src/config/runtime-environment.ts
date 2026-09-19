import { hkdfSync } from 'node:crypto';
import { z } from 'zod';

const optionalSecret = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .min(32)
    .max(1_024)
    .refine((value) => !/\s/u.test(value), 'Secret must not contain whitespace')
    .optional(),
);
const integer = (minimum: number, maximum: number, fallback: number) =>
  z.coerce.number().int().min(minimum).max(maximum).default(fallback);
const booleanSetting = (fallback: boolean) =>
  z.preprocess((value) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }, z.boolean().default(fallback));

const runtimeSchema = z.object({
  AGENT_RUNTIME_ASSISTANT_ID: z.string().min(1).default('orchestrator'),
  AGENT_RUNTIME_TITLE_ASSISTANT_ID: z.string().trim().default('title_agent'),
  AGENT_RUNTIME_URL: z
    .string()
    .url()
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.pathname === '/'
        );
      } catch {
        return false;
      }
    }, 'AGENT_RUNTIME_URL must be a credential-free HTTP(S) origin')
    .default('http://localhost:8000'),
  EXECUTION_CURSOR_KEY: optionalSecret,
  EXECUTION_CURSOR_KEY_PREVIOUS: optionalSecret,
  EXECUTION_COMMIT_WINDOW_MS: integer(100, 5_000, 500),
  EXECUTION_CURSOR_TTL_MS: integer(1_000, 3_600_000, 3_600_000),
  EXECUTION_DEADLINE_MS: integer(120_000, 3_600_000, 600_000),
  EXECUTION_LEASE_MS: integer(15_000, 120_000, 30_000),
  EXECUTION_WORKER_CONCURRENCY: integer(1, 32, 4),
  EXECUTION_MAX_ACTIVE_PER_USER: integer(1, 32, 4),
  EXECUTION_MAX_ACTIVE_GLOBAL: integer(1, 1_000, 64),
  EXECUTION_SSE_HEARTBEAT_MS: integer(1_000, 59_000, 25_000),
  EXECUTION_SSE_DRAIN_TIMEOUT_MS: integer(100, 30_000, 10_000),
  EXECUTION_SSE_MAX_FRAME_BYTES: integer(1_024, 8_388_608, 2_097_152),
  EXECUTION_SSE_MAX_BUFFERED_BYTES: integer(1_024, 16_777_216, 4_194_304),
  EXECUTION_MAX_OBSERVERS_PER_USER: integer(1, 32, 4),
  EXECUTION_MAX_OBSERVERS_PER_INSTANCE: integer(1, 2_048, 128),
  EXECUTION_OBSERVER_REAUTH_MS: integer(1_000, 25_000, 25_000),
  /**
   * Records the reasoning text and the specialists' intermediate messages in the work log. The
   * product owner chose this on 2026-09-16; ALF-DEC-037 keeps it excluded by default in the
   * register, so a deployment can turn it off and keep markers only.
   */
  EXECUTION_WORK_LOG_CONTENT_ENABLED: booleanSetting(true),
});

export const runtimeEnvironmentFields = runtimeSchema.shape;
type RuntimeEnvironment = z.infer<typeof runtimeSchema>;

/** Replicas share a stable, purpose-separated cursor key without extra runtime provisioning. */
export function deriveExecutionCursorKey(jwtSecret: string): string {
  return Buffer.from(
    hkdfSync('sha256', jwtSecret, 'alfred', 'execution-resume-cursor-v1', 32),
  ).toString('hex');
}

export function validateRuntimeEnvironment(
  environment: RuntimeEnvironment,
  context: z.RefinementCtx,
): void {
  const issue = (key: keyof RuntimeEnvironment, message: string) =>
    context.addIssue({
      code: 'custom',
      message,
      path: [key],
    });
  if (
    environment.EXECUTION_SSE_HEARTBEAT_MS + environment.EXECUTION_SSE_DRAIN_TIMEOUT_MS >=
    60_000
  ) {
    issue(
      'EXECUTION_SSE_HEARTBEAT_MS',
      'Heartbeat plus drain timeout must remain below the 60-second ingress silence budget',
    );
  }
  if (environment.EXECUTION_SSE_MAX_BUFFERED_BYTES < environment.EXECUTION_SSE_MAX_FRAME_BYTES) {
    issue(
      'EXECUTION_SSE_MAX_BUFFERED_BYTES',
      'The observer buffer must accommodate one complete frame',
    );
  }
  if (environment.EXECUTION_MAX_ACTIVE_PER_USER > environment.EXECUTION_MAX_ACTIVE_GLOBAL) {
    issue('EXECUTION_MAX_ACTIVE_PER_USER', 'User execution limit cannot exceed the global limit');
  }
  if (
    environment.EXECUTION_MAX_OBSERVERS_PER_USER > environment.EXECUTION_MAX_OBSERVERS_PER_INSTANCE
  ) {
    issue(
      'EXECUTION_MAX_OBSERVERS_PER_USER',
      'User observer limit cannot exceed the instance limit',
    );
  }
  for (const key of ['EXECUTION_CURSOR_KEY', 'EXECUTION_CURSOR_KEY_PREVIOUS'] as const) {
    if (environment[key]?.toLowerCase().includes('replace-with'))
      issue(key, 'Committed placeholder credentials cannot protect execution cursors');
  }
}
