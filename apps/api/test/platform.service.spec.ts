import { describe, expect, it } from 'vitest';
import { PlatformController } from '../src/modules/platform/platform.controller';
import { PlatformService } from '../src/modules/platform/platform.service';
import type { FeatureFlagsService } from '../src/modules/feature-flags/feature-flags.service';

describe('PlatformService', () => {
  it('exposes the scaffolded layers', () => {
    const features = Object.freeze({
      agentRuntime: true,
      agUiStreaming: false,
      fileUploads: false,
      generativeUi: false,
      googleOAuth: false,
      mcpApps: false,
      runtimeMemory: true,
      skills: true,
      teams: false,
    });
    const flags = { getPublicFlags: () => features } as unknown as FeatureFlagsService;
    const service = new PlatformService(flags);
    expect(service.getStatus()).toEqual(
      expect.objectContaining({
        enabledCapabilities: ['orchestration', 'skills', 'runtime-memory'],
        features,
        layers: ['web', 'api', 'agent'],
      }),
    );
    expect(new PlatformController(service).getStatus()).toEqual({
      data: service.getStatus(),
      success: true,
    });
  });
});
