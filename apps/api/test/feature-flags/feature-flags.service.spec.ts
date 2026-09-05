import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { FeatureFlagsService } from '../../src/modules/feature-flags/feature-flags.service';
import { FeatureFlagsController } from '../../src/modules/feature-flags/feature-flags.controller';

const configuredFlags = Object.freeze({
  FEATURE_AGENT_RUNTIME_ENABLED: true,
  FEATURE_AG_UI_STREAMING_ENABLED: false,
  FEATURE_FILE_UPLOADS_ENABLED: false,
  FEATURE_GENERATIVE_UI_ENABLED: true,
  FEATURE_GOOGLE_OAUTH_ENABLED: false,
  FEATURE_MCP_APPS_ENABLED: false,
  FEATURE_RUNTIME_MEMORY_ENABLED: true,
  FEATURE_SKILLS_ENABLED: true,
  FEATURE_TEAMS_ENABLED: true,
});

function config(): ConfigService {
  return {
    getOrThrow: vi.fn((key: keyof typeof configuredFlags) => configuredFlags[key]),
  } as unknown as ConfigService;
}

describe('FeatureFlagsService', () => {
  it('creates an immutable typed snapshot from environment configuration', () => {
    const service = new FeatureFlagsService(config());

    expect(service.getPublicFlags()).toEqual({
      agentRuntime: true,
      agUiStreaming: false,
      fileUploads: false,
      generativeUi: true,
      googleOAuth: false,
      mcpApps: false,
      runtimeMemory: true,
      skills: true,
      teams: true,
    });
    expect(Object.isFrozen(service.getPublicFlags())).toBe(true);
    expect(new FeatureFlagsController(service).getFlags()).toEqual({
      data: service.getPublicFlags(),
      success: true,
    });
  });

  it('provides one authoritative lookup for route guards and services', () => {
    const service = new FeatureFlagsService(config());

    expect(service.isEnabled('googleOAuth')).toBe(false);
    expect(service.isEnabled('agentRuntime')).toBe(true);
  });
});
