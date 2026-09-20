import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FEATURE_FLAG_ENVIRONMENT_KEYS,
  type BackendFeatureFlagName,
  type BackendFeatureFlags,
  type FeatureFlagName,
  type FeatureFlags,
} from './feature-flags.types';

// Promote only with a real execution path and enabled/disabled contract tests.
const IMPLEMENTED_PUBLIC_FEATURES = Object.freeze({
  agentRuntime: true,
  agUiStreaming: false,
  fileUploads: true,
  generativeUi: false,
  googleOAuth: true,
  mcpApps: false,
  outputStyles: false,
  knowledgeScope: false,
  conversationFeedback: false,
  runtimeMemory: false,
  skills: true,
  teams: true,
  traceLinks: true,
} as const satisfies Readonly<Record<FeatureFlagName, boolean>>);

@Injectable()
export class FeatureFlagsService {
  private readonly flags: BackendFeatureFlags;
  private readonly publicFlags: FeatureFlags;

  constructor(config: ConfigService) {
    this.publicFlags = Object.freeze(
      Object.fromEntries(
        Object.entries(IMPLEMENTED_PUBLIC_FEATURES).map(([feature, implemented]) => [
          feature,
          implemented &&
            config.getOrThrow<boolean>(FEATURE_FLAG_ENVIRONMENT_KEYS[feature as FeatureFlagName]),
        ]),
      ) as FeatureFlags,
    );
    this.flags = Object.freeze({
      ...this.publicFlags,
      openApi:
        config.getOrThrow<boolean>(FEATURE_FLAG_ENVIRONMENT_KEYS.openApi) &&
        config.getOrThrow<string>('NODE_ENV') !== 'production',
      rateLimiting: config.getOrThrow<boolean>(FEATURE_FLAG_ENVIRONMENT_KEYS.rateLimiting),
    });
  }

  getPublicFlags(): FeatureFlags {
    return this.publicFlags;
  }

  isEnabled(feature: BackendFeatureFlagName): boolean {
    return this.flags[feature];
  }
}
