import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FEATURE_FLAG_ENVIRONMENT_KEYS,
  type FeatureFlagName,
  type FeatureFlags,
} from './feature-flags.types';

@Injectable()
export class FeatureFlagsService {
  private readonly flags: FeatureFlags;

  constructor(config: ConfigService) {
    this.flags = Object.freeze({
      agentRuntime: config.getOrThrow<boolean>(FEATURE_FLAG_ENVIRONMENT_KEYS.agentRuntime),
      agUiStreaming: config.getOrThrow<boolean>(FEATURE_FLAG_ENVIRONMENT_KEYS.agUiStreaming),
      fileUploads: config.getOrThrow<boolean>(FEATURE_FLAG_ENVIRONMENT_KEYS.fileUploads),
      generativeUi: config.getOrThrow<boolean>(FEATURE_FLAG_ENVIRONMENT_KEYS.generativeUi),
      googleOAuth: config.getOrThrow<boolean>(FEATURE_FLAG_ENVIRONMENT_KEYS.googleOAuth),
      mcpApps: config.getOrThrow<boolean>(FEATURE_FLAG_ENVIRONMENT_KEYS.mcpApps),
      runtimeMemory: config.getOrThrow<boolean>(FEATURE_FLAG_ENVIRONMENT_KEYS.runtimeMemory),
      skills: config.getOrThrow<boolean>(FEATURE_FLAG_ENVIRONMENT_KEYS.skills),
      teams: config.getOrThrow<boolean>(FEATURE_FLAG_ENVIRONMENT_KEYS.teams),
    });
  }

  getPublicFlags(): FeatureFlags {
    return this.flags;
  }

  isEnabled(feature: FeatureFlagName): boolean {
    return this.flags[feature];
  }
}
