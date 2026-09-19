import type { S3Client } from '@aws-sdk/client-s3';
import { describe } from 'vitest';

import { resolveFileStorageSettings } from '@api/config/file-storage';
import {
  createS3Client,
  S3ContentStore,
} from '@api/modules/files/infrastructure/storage/s3-content.store';
import { describeContentStoreContract } from '../../../support/content-store-contract';

/**
 * The same contract as the on-disk store, against a real S3-compatible server. `make dev` starts
 * MinIO; set the variables below to run it, for example:
 *
 * ```sh
 * TEST_FILE_STORAGE_S3_ENDPOINT=http://localhost:9000 \
 * TEST_FILE_STORAGE_S3_BUCKET=alfred-files \
 * TEST_FILE_STORAGE_S3_ACCESS_KEY_ID=alfred \
 * TEST_FILE_STORAGE_S3_SECRET_ACCESS_KEY=alfred-local-secret \
 * pnpm --filter @alfred/api test
 * ```
 *
 * Point the same variables at Cloudflare R2, IBM COS or AWS S3 to qualify another provider before
 * a deployment switches to it.
 */
const endpoint = process.env.TEST_FILE_STORAGE_S3_ENDPOINT;
const bucket = process.env.TEST_FILE_STORAGE_S3_BUCKET;
const accessKeyId = process.env.TEST_FILE_STORAGE_S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.TEST_FILE_STORAGE_S3_SECRET_ACCESS_KEY;

const configured =
  endpoint !== undefined &&
  bucket !== undefined &&
  accessKeyId !== undefined &&
  secretAccessKey !== undefined;

const suite = configured ? describe : describe.skip;

suite('S3-compatible content store against a real provider', () => {
  let client: S3Client | undefined;

  describeContentStoreContract(() => {
    // Resolved lazily: a skipped suite is still collected, and an empty description would throw.
    const settings = resolveFileStorageSettings({
      NODE_ENV: 'test',
      FEATURE_FILE_UPLOADS_ENABLED: true,
      FILE_STORAGE_LOCAL_ROOT: 'var/uploads',
      FILE_STORAGE_S3_ENDPOINT: endpoint,
      FILE_STORAGE_S3_BUCKET: bucket,
      FILE_STORAGE_S3_REGION: process.env.TEST_FILE_STORAGE_S3_REGION ?? 'us-east-1',
      FILE_STORAGE_S3_ACCESS_KEY_ID: accessKeyId,
      FILE_STORAGE_S3_SECRET_ACCESS_KEY: secretAccessKey,
    });
    if (settings.driver !== 's3') throw new Error('The suite requires a described bucket');
    client ??= createS3Client(settings);
    return new S3ContentStore(client, settings);
  });
});
