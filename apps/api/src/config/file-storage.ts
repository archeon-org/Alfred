import { z } from 'zod';

import { booleanFromEnvironment, emptyStringToUndefined } from './environment-primitives';

/**
 * Where uploaded file bytes live. ALF-DEC-054 keeps physical bytes behind one provider-neutral
 * port: the deployment selects a single primary adapter, and no caller ever learns the provider,
 * the bucket or a credential. A described bucket selects the S3-compatible adapter; without one a
 * developer machine keeps its files on disk. The selection is logged at startup and probed before
 * the API accepts traffic.
 */
export interface S3StaticCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string | undefined;
}

export type FileStorageSettings =
  | { readonly driver: 'local'; readonly root: string }
  | {
      readonly driver: 's3';
      readonly bucket: string;
      readonly region: string;
      readonly endpoint?: string | undefined;
      /** Absent means the SDK's default chain: an IAM role, IRSA, an ECS task role. */
      readonly credentials?: S3StaticCredentials | undefined;
      readonly forcePathStyle: boolean;
      readonly prefix: string;
    };

/** A key prefix inside the bucket: no leading or trailing slash, no traversal segment. */
const objectPrefix = z
  .string()
  .max(128)
  .transform((value) => value.replace(/^\/+|\/+$/gu, ''))
  .refine((value) => !value.split('/').includes('..'), {
    message: 'FILE_STORAGE_S3_PREFIX must not contain a ".." segment',
  });

/** AWS naming rules, which every compatible provider accepts. */
const bucketName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u, 'Must be a valid S3 bucket name');

/** A provider address: `http(s)` only, and nothing that would carry a credential into a log. */
const isPlainEndpoint = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
};

export const fileStorageEnvironmentFields = {
  FILE_STORAGE_LOCAL_ROOT: z.string().min(1).max(512).default('var/uploads'),
  FILE_STORAGE_S3_BUCKET: z.preprocess(emptyStringToUndefined, bucketName.optional()),
  FILE_STORAGE_S3_REGION: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).max(64).optional(),
  ),
  FILE_STORAGE_S3_ENDPOINT: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .url()
      .refine(isPlainEndpoint, 'Must be an http(s) address without credentials, query or fragment')
      .optional(),
  ),
  FILE_STORAGE_S3_ACCESS_KEY_ID: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).max(256).optional(),
  ),
  FILE_STORAGE_S3_SECRET_ACCESS_KEY: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).max(512).optional(),
  ),
  FILE_STORAGE_S3_SESSION_TOKEN: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).max(4_096).optional(),
  ),
  FILE_STORAGE_S3_FORCE_PATH_STYLE: z.preprocess(
    emptyStringToUndefined,
    booleanFromEnvironment.optional(),
  ),
  FILE_STORAGE_S3_PREFIX: z.preprocess(emptyStringToUndefined, objectPrefix.optional()),
} as const;

export interface FileStorageEnvironment {
  readonly NODE_ENV: 'development' | 'test' | 'production';
  readonly FEATURE_FILE_UPLOADS_ENABLED: boolean;
  readonly FILE_STORAGE_LOCAL_ROOT: string;
  readonly FILE_STORAGE_S3_BUCKET?: string | undefined;
  readonly FILE_STORAGE_S3_REGION?: string | undefined;
  readonly FILE_STORAGE_S3_ENDPOINT?: string | undefined;
  readonly FILE_STORAGE_S3_ACCESS_KEY_ID?: string | undefined;
  readonly FILE_STORAGE_S3_SECRET_ACCESS_KEY?: string | undefined;
  readonly FILE_STORAGE_S3_SESSION_TOKEN?: string | undefined;
  readonly FILE_STORAGE_S3_FORCE_PATH_STYLE?: boolean | undefined;
  readonly FILE_STORAGE_S3_PREFIX?: string | undefined;
}

/** Every setting that only makes sense with a bucket; one of them alone is a described bucket. */
const S3_KEYS = [
  'FILE_STORAGE_S3_BUCKET',
  'FILE_STORAGE_S3_REGION',
  'FILE_STORAGE_S3_ENDPOINT',
  'FILE_STORAGE_S3_ACCESS_KEY_ID',
  'FILE_STORAGE_S3_SECRET_ACCESS_KEY',
  'FILE_STORAGE_S3_SESSION_TOKEN',
  'FILE_STORAGE_S3_FORCE_PATH_STYLE',
  'FILE_STORAGE_S3_PREFIX',
] as const;

const usesHttps = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

export function hasAnyS3Setting(environment: FileStorageEnvironment): boolean {
  return S3_KEYS.some((key) => environment[key] !== undefined);
}

/** What stops a bucket description from being usable; empty when it is complete or absent. */
function bucketIssues(
  environment: FileStorageEnvironment,
): readonly { readonly key: (typeof S3_KEYS)[number]; readonly message: string }[] {
  if (!hasAnyS3Setting(environment)) return [];
  const issues: { key: (typeof S3_KEYS)[number]; message: string }[] = [];

  // A partially described bucket never silently falls back to the local disk.
  for (const key of ['FILE_STORAGE_S3_BUCKET', 'FILE_STORAGE_S3_REGION'] as const) {
    if (environment[key] === undefined) {
      issues.push({
        key,
        message: `${key} is required when any FILE_STORAGE_S3_* setting is present`,
      });
    }
  }

  // Static keys come as a pair; without them the SDK resolves an IAM role by itself.
  const hasId = environment.FILE_STORAGE_S3_ACCESS_KEY_ID !== undefined;
  const hasSecret = environment.FILE_STORAGE_S3_SECRET_ACCESS_KEY !== undefined;
  if (hasId !== hasSecret) {
    issues.push({
      key: hasId ? 'FILE_STORAGE_S3_SECRET_ACCESS_KEY' : 'FILE_STORAGE_S3_ACCESS_KEY_ID',
      message:
        'FILE_STORAGE_S3_ACCESS_KEY_ID and FILE_STORAGE_S3_SECRET_ACCESS_KEY are set together or not at all',
    });
  }
  if (environment.FILE_STORAGE_S3_SESSION_TOKEN !== undefined && !(hasId && hasSecret)) {
    issues.push({
      key: 'FILE_STORAGE_S3_SESSION_TOKEN',
      message: 'FILE_STORAGE_S3_SESSION_TOKEN requires the access key pair',
    });
  }
  return issues;
}

/**
 * The storage settings at startup: nothing is required while uploads are off, a bucket is
 * described completely rather than partially, and a developer machine's local directory is never
 * a production profile.
 */
export function validateFileStorageEnvironment(
  environment: FileStorageEnvironment,
  context: z.RefinementCtx,
): void {
  if (!environment.FEATURE_FILE_UPLOADS_ENABLED) return;

  if (!hasAnyS3Setting(environment)) {
    // No bucket at all: files stay on this machine's disk, which only a developer may do.
    if (environment.NODE_ENV === 'production') {
      context.addIssue({
        code: 'custom',
        message:
          'FEATURE_FILE_UPLOADS_ENABLED requires an S3-compatible bucket in production; local file storage is a development profile',
        path: ['FILE_STORAGE_S3_BUCKET'],
      });
    }
    return;
  }

  for (const issue of bucketIssues(environment)) {
    context.addIssue({ code: 'custom', message: issue.message, path: [issue.key] });
  }

  if (
    environment.NODE_ENV === 'production' &&
    environment.FILE_STORAGE_S3_ENDPOINT !== undefined &&
    !usesHttps(environment.FILE_STORAGE_S3_ENDPOINT)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'FILE_STORAGE_S3_ENDPOINT must use HTTPS in production',
      path: ['FILE_STORAGE_S3_ENDPOINT'],
    });
  }
}

/** AWS answers on its own hosts through the bucket's host name; everything else through the path. */
const isAwsEndpoint = (endpoint: string): boolean =>
  new URL(endpoint).hostname.endsWith('.amazonaws.com');

/**
 * The adapter this deployment uses. It refuses the same inconsistent descriptions as the startup
 * validation rather than quietly choosing the disk, so that a caller which skipped validation
 * still cannot split objects between two stores.
 */
export function resolveFileStorageSettings(
  environment: FileStorageEnvironment,
): FileStorageSettings {
  if (!hasAnyS3Setting(environment)) {
    return { driver: 'local', root: environment.FILE_STORAGE_LOCAL_ROOT };
  }

  const [issue] = bucketIssues(environment);
  if (issue !== undefined) throw new Error(issue.message);

  const endpoint = environment.FILE_STORAGE_S3_ENDPOINT;
  const accessKeyId = environment.FILE_STORAGE_S3_ACCESS_KEY_ID;
  const secretAccessKey = environment.FILE_STORAGE_S3_SECRET_ACCESS_KEY;

  return {
    driver: 's3',
    // Both are present: `bucketIssues` would have reported them otherwise.
    bucket: environment.FILE_STORAGE_S3_BUCKET as string,
    region: environment.FILE_STORAGE_S3_REGION as string,
    endpoint,
    credentials:
      accessKeyId === undefined || secretAccessKey === undefined
        ? undefined
        : {
            accessKeyId,
            secretAccessKey,
            sessionToken: environment.FILE_STORAGE_S3_SESSION_TOKEN,
          },
    forcePathStyle:
      environment.FILE_STORAGE_S3_FORCE_PATH_STYLE ??
      (endpoint !== undefined && !isAwsEndpoint(endpoint)),
    prefix: environment.FILE_STORAGE_S3_PREFIX ?? '',
  };
}

/** The provider address as it may appear in a log: never more than scheme, host and port. */
export function describeStorageTarget(settings: FileStorageSettings): string {
  if (settings.driver === 'local') return settings.root;
  const where =
    settings.endpoint === undefined
      ? `region ${settings.region}`
      : new URL(settings.endpoint).origin;
  return `${settings.bucket} (${where})`;
}
