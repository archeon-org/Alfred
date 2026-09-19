import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';

import { describeStorageTarget, type FileStorageSettings } from '../../../../config/file-storage';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import { ARTIFACT_CONTENT_STORE, type ArtifactContentStore } from '../../domain/content-store.port';
import { FILE_STORAGE_SETTINGS } from './file-storage.settings';

const PROBE_TIMEOUT_MS = 10_000;
const HEALTH_CACHE_MS = 30_000;

/** Empty while the capability is off, so readiness answers are unchanged for such deployments. */
export type FileStorageHealth =
  Readonly<Record<string, never>> | { readonly storage: { readonly status: 'down' | 'up' } };

/**
 * Proves the selected store at startup and reports it to readiness. An enabled capability whose
 * storage cannot be written to is a misconfiguration: the API refuses to start instead of letting
 * the first upload discover a read-only directory, a mistyped bucket or a wrong region.
 */
@Injectable()
export class ContentStoreLifecycle implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('FileStorage');
  private lastCheck: { readonly at: number; readonly up: boolean } | null = null;

  constructor(
    @Inject(ARTIFACT_CONTENT_STORE) private readonly store: ArtifactContentStore,
    @Inject(FILE_STORAGE_SETTINGS) private readonly settings: FileStorageSettings,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.flags?.isEnabled('fileUploads') !== true) return;
    await this.store.probe({ signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    this.lastCheck = { at: Date.now(), up: true };
    const where = describeStorageTarget(this.settings);
    this.logger.log(
      this.settings.driver === 'local'
        ? `Uploaded files are stored on this machine, under ${where}`
        : `Uploaded files are stored in the S3-compatible bucket ${where}`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.store.close();
  }

  /** Cached so that an orchestrator's readiness polling is not one provider request per probe. */
  async check(): Promise<FileStorageHealth> {
    if (this.flags?.isEnabled('fileUploads') !== true) return {};
    const now = Date.now();
    if (this.lastCheck === null || now - this.lastCheck.at > HEALTH_CACHE_MS) {
      const up = await this.store
        .probe({ signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
        .then(() => true)
        .catch(() => false);
      this.lastCheck = { at: now, up };
    }
    return { storage: { status: this.lastCheck.up ? 'up' : 'down' } };
  }
}
