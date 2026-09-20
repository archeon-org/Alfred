import { describe, expect, it } from 'vitest';

import { parseEnvironment } from '@api/config/environment';
import {
  describeStorageTarget,
  resolveFileStorageSettings,
  type FileStorageEnvironment,
} from '@api/config/file-storage';

/** Raw strings, as a process environment spells them, parsed by the real startup schema. */
const baseEnvironment = Object.freeze({
  AUTH_JWT_SECRET: 'test-only-secret-that-is-longer-than-32-characters',
  DATABASE_URL: 'postgresql://alfred:local-password@localhost:5432/alfred_app?schema=public',
  FEATURE_FILE_UPLOADS_ENABLED: 'true',
  NODE_ENV: 'development',
});

const production = Object.freeze({
  ...baseEnvironment,
  API_CORS_ORIGINS: 'https://app.alfred.example',
  AUTH_COOKIE_SECURE: 'true',
  NODE_ENV: 'production',
  REDIS_URL: 'rediss://:a-password@redis.internal:6379',
  WEB_APP_URL: 'https://app.alfred.example',
});

const bucket = Object.freeze({
  FILE_STORAGE_S3_BUCKET: 'alfred-files',
  FILE_STORAGE_S3_REGION: 'eu-west-3',
});

const keys = Object.freeze({
  FILE_STORAGE_S3_ACCESS_KEY_ID: 'key',
  FILE_STORAGE_S3_SECRET_ACCESS_KEY: 'a-long-random-secret',
});

const settingsOf = (raw: Record<string, string>) =>
  resolveFileStorageSettings(parseEnvironment(raw));

describe('file storage environment', () => {
  it('requires nothing while uploads are off', () => {
    expect(() =>
      parseEnvironment({ ...production, FEATURE_FILE_UPLOADS_ENABLED: 'false' }),
    ).not.toThrow();
  });

  it('stores files on this machine when no bucket is described, blank values included', () => {
    const blank = Object.fromEntries(
      ['BUCKET', 'REGION', 'ENDPOINT', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY', 'PREFIX'].map(
        (name) => [`FILE_STORAGE_S3_${name}`, '  '],
      ),
    );

    expect(settingsOf({ ...baseEnvironment, ...blank })).toEqual({
      driver: 'local',
      root: 'var/uploads',
    });
  });

  it('refuses local storage in production', () => {
    expect(() => parseEnvironment(production)).toThrow(/local file storage is a development/u);
  });

  it.each([
    ['FILE_STORAGE_S3_REGION', { FILE_STORAGE_S3_BUCKET: 'alfred-files' }],
    ['FILE_STORAGE_S3_BUCKET', { FILE_STORAGE_S3_FORCE_PATH_STYLE: 'true' }],
    ['FILE_STORAGE_S3_BUCKET', { FILE_STORAGE_S3_PREFIX: 'alfred' }],
    ['FILE_STORAGE_S3_SECRET_ACCESS_KEY', { ...bucket, FILE_STORAGE_S3_ACCESS_KEY_ID: 'key' }],
    ['FILE_STORAGE_S3_SESSION_TOKEN', { ...bucket, FILE_STORAGE_S3_SESSION_TOKEN: 'token' }],
  ])('refuses a partially described bucket: %s', (missing, partial) => {
    expect(() => parseEnvironment({ ...baseEnvironment, ...partial })).toThrow(missing);
    expect(() =>
      resolveFileStorageSettings({
        NODE_ENV: 'development',
        FEATURE_FILE_UPLOADS_ENABLED: true,
        FILE_STORAGE_LOCAL_ROOT: 'var/uploads',
        ...partial,
      } as FileStorageEnvironment),
    ).toThrow(missing);
  });

  it('uses static keys when they are given', () => {
    expect(settingsOf({ ...baseEnvironment, ...bucket, ...keys })).toEqual({
      driver: 's3',
      bucket: 'alfred-files',
      region: 'eu-west-3',
      endpoint: undefined,
      credentials: {
        accessKeyId: 'key',
        secretAccessKey: 'a-long-random-secret',
        sessionToken: undefined,
      },
      forcePathStyle: false,
      prefix: '',
    });
  });

  it('leaves credentials to the platform role when no key is given', () => {
    expect(settingsOf({ ...production, ...bucket })).toMatchObject({
      driver: 's3',
      credentials: undefined,
    });
  });

  it('carries a temporary session token with its key pair', () => {
    expect(
      settingsOf({ ...baseEnvironment, ...bucket, ...keys, FILE_STORAGE_S3_SESSION_TOKEN: 'sts' }),
    ).toMatchObject({ credentials: { sessionToken: 'sts' } });
  });

  it.each([
    ['http://localhost:9000', true],
    ['https://account.r2.cloudflarestorage.com', true],
    ['https://s3.eu-west-3.amazonaws.com', false],
    ['https://bucket.vpce-1a2b.s3.eu-west-3.vpce.amazonaws.com', false],
  ])('addresses %s through the path: %s', (endpoint, pathStyle) => {
    expect(
      settingsOf({ ...baseEnvironment, ...bucket, FILE_STORAGE_S3_ENDPOINT: endpoint }),
    ).toMatchObject({ forcePathStyle: pathStyle });
  });

  it('keeps an explicit path-style choice and normalizes the prefix', () => {
    expect(
      settingsOf({
        ...baseEnvironment,
        ...bucket,
        FILE_STORAGE_S3_ENDPOINT: 'https://s3.fr-par.scw.cloud',
        FILE_STORAGE_S3_FORCE_PATH_STYLE: 'false',
        FILE_STORAGE_S3_PREFIX: '/alfred/prod/',
      }),
    ).toMatchObject({ forcePathStyle: false, prefix: 'alfred/prod' });
  });

  it.each([
    ['FILE_STORAGE_S3_BUCKET', 'Alfred_Files'],
    ['FILE_STORAGE_S3_BUCKET', 'ab'],
    ['FILE_STORAGE_S3_PREFIX', 'alfred/../other'],
    ['FILE_STORAGE_S3_ENDPOINT', 'https://user:secret@minio.internal:9000'],
    ['FILE_STORAGE_S3_ENDPOINT', 'ftp://minio.internal'],
    ['FILE_STORAGE_S3_ENDPOINT', 'https://minio.internal/?x=1'],
    ['FILE_STORAGE_S3_FORCE_PATH_STYLE', 'yes'],
  ])('refuses %s=%s', (key, value) => {
    expect(() => parseEnvironment({ ...baseEnvironment, ...bucket, [key]: value })).toThrow(key);
  });

  it('requires an encrypted endpoint and a real secret in production', () => {
    expect(() =>
      parseEnvironment({
        ...production,
        ...bucket,
        FILE_STORAGE_S3_ENDPOINT: 'http://storage.internal:9000',
      }),
    ).toThrow('FILE_STORAGE_S3_ENDPOINT must use HTTPS in production');
    expect(() =>
      parseEnvironment({
        ...production,
        ...bucket,
        FILE_STORAGE_S3_ACCESS_KEY_ID: 'key',
        FILE_STORAGE_S3_SECRET_ACCESS_KEY: 'replace-with-a-real-secret',
      }),
    ).toThrow('FILE_STORAGE_S3_SECRET_ACCESS_KEY');
  });

  it('describes the target for a log without path, credentials or query', () => {
    expect(
      describeStorageTarget(
        settingsOf({
          ...baseEnvironment,
          ...bucket,
          ...keys,
          FILE_STORAGE_S3_ENDPOINT: 'https://minio.internal:9000/base',
        }),
      ),
    ).toBe('alfred-files (https://minio.internal:9000)');
    expect(describeStorageTarget(settingsOf({ ...baseEnvironment, ...bucket }))).toBe(
      'alfred-files (region eu-west-3)',
    );
  });
});
