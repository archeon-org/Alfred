import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import type { FileStorageSettings } from '../../config/file-storage';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { ARTIFACT_CONTENT_STORE, type ArtifactContentStore } from './domain/content-store.port';
import { ContentStoreLifecycle } from './infrastructure/storage/content-store.lifecycle';
import { DisabledContentStore } from './infrastructure/storage/disabled-content.store';
import {
  FILE_STORAGE_SETTINGS,
  readFileStorageSettings,
} from './infrastructure/storage/file-storage.settings';
import { LocalContentStore } from './infrastructure/storage/local-content.store';
import { createS3Client, S3ContentStore } from './infrastructure/storage/s3-content.store';

/**
 * The composition root that binds one content adapter per deployment, as ALF-DEC-054 requires.
 * A deployment with a described S3-compatible bucket uses it; a developer machine without one
 * keeps its files on disk under the same key layout. Nothing falls back at runtime: a failing
 * bucket write is an error, never a silent write to a second store.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: FILE_STORAGE_SETTINGS,
      inject: [ConfigService],
      useFactory: readFileStorageSettings,
    },
    {
      provide: ARTIFACT_CONTENT_STORE,
      // Optional: a composition without the flag registry has, by definition, no upload capability.
      inject: [FILE_STORAGE_SETTINGS, { token: FeatureFlagsService, optional: true }],
      useFactory: (
        settings: FileStorageSettings,
        flags?: FeatureFlagsService,
      ): ArtifactContentStore => {
        // The effective capability — configured and implemented — not the raw environment value.
        if (flags?.isEnabled('fileUploads') !== true) return new DisabledContentStore();
        if (settings.driver === 'local') return new LocalContentStore(settings.root);
        return new S3ContentStore(createS3Client(settings), settings);
      },
    },
    ContentStoreLifecycle,
  ],
  exports: [ARTIFACT_CONTENT_STORE, FILE_STORAGE_SETTINGS, ContentStoreLifecycle],
})
export class FilesStorageModule {}
