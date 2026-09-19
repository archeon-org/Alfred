import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { readFileSettings } from '@api/modules/files/application/file-settings';
import { readFileStorageSettings } from '@api/modules/files/infrastructure/storage/file-storage.settings';

describe('file settings', () => {
  it('falls back to the documented defaults in a composition without the full environment', () => {
    const settings = readFileSettings(new ConfigService({}));

    expect(settings).toMatchObject({
      maxFileBytes: 5 * 1024 * 1024,
      quotaBytesPerUser: 25 * 1024 * 1024,
      promptTokensPerDocument: 10_000,
      promptTokensPerExecution: 30_000,
      maxConcurrentUploads: 4,
    });
    expect(Object.isFrozen(settings)).toBe(true);
  });

  it('reads configured bounds, and refuses one outside its range', () => {
    expect(
      readFileSettings(new ConfigService({ FILE_UPLOAD_MAX_BYTES: '1024' })).maxFileBytes,
    ).toBe(1024);
    expect(() =>
      readFileSettings(new ConfigService({ FILE_PROMPT_TOKENS_PER_DOCUMENT: 1 })),
    ).toThrow();
  });

  it('selects the local directory by default and a described bucket otherwise', () => {
    expect(readFileStorageSettings(new ConfigService({}))).toEqual({
      driver: 'local',
      root: 'var/uploads',
    });
    expect(
      readFileStorageSettings(
        new ConfigService({
          FILE_STORAGE_S3_BUCKET: 'alfred-files',
          FILE_STORAGE_S3_REGION: 'auto',
          FILE_STORAGE_S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
        }),
      ),
    ).toMatchObject({ driver: 's3', bucket: 'alfred-files', region: 'auto', forcePathStyle: true });
  });
});
