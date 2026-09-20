import type { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import {
  fileStorageEnvironmentFields,
  type FileStorageSettings,
  resolveFileStorageSettings,
} from '../../../../config/file-storage';

export const FILE_STORAGE_SETTINGS = Symbol('FILE_STORAGE_SETTINGS');

const schema = z.object(fileStorageEnvironmentFields);

/**
 * The validated environment, narrowed to what selects and configures the content store. Parsed
 * with the startup schema so that a composition without the full environment (a focused test
 * module) still gets the documented defaults instead of an undefined directory.
 */
export function readFileStorageSettings(config: ConfigService): FileStorageSettings {
  const values = schema.parse(
    Object.fromEntries(
      Object.keys(fileStorageEnvironmentFields).map((key) => [key, config.get<unknown>(key)]),
    ),
  );
  return resolveFileStorageSettings({
    NODE_ENV: config.get<'development' | 'test' | 'production'>('NODE_ENV') ?? 'development',
    FEATURE_FILE_UPLOADS_ENABLED: config.get<boolean>('FEATURE_FILE_UPLOADS_ENABLED') ?? false,
    ...values,
  });
}
