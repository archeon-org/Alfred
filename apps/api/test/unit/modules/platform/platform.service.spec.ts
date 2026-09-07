import { describe, expect, it } from 'vitest';
import type { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import { PlatformController } from '@api/modules/platform/platform.controller';
import { PlatformService } from '@api/modules/platform/platform.service';

describe('PlatformService', () => {
  it('exposes the scaffolded layers', () => {
    const features = Object.freeze({
      agentRuntime: true,
      agUiStreaming: false,
      fileUploads: false,
      generativeUi: false,
      googleOAuth: false,
      mcpApps: false,
      outputStyles: false,
      knowledgeScope: false,
      conversationFeedback: false,
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
