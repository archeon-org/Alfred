import { FEATURE_FLAG_NAMES, featureFlagsSchema } from '@alfred/contracts';
import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { FeatureFlagGuard } from '@api/modules/feature-flags/feature-flag.guard';
import { FeatureFlagsController } from '@api/modules/feature-flags/feature-flags.controller';
import { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import type { FeatureFlagName } from '@api/modules/feature-flags/feature-flags.types';

const configuredFlags = Object.freeze({
  FEATURE_AGENT_RUNTIME_ENABLED: true,
  FEATURE_AG_UI_STREAMING_ENABLED: true,
  FEATURE_FILE_UPLOADS_ENABLED: true,
  FEATURE_GENERATIVE_UI_ENABLED: true,
  FEATURE_GOOGLE_OAUTH_ENABLED: true,
  FEATURE_MCP_APPS_ENABLED: true,
  FEATURE_OUTPUT_STYLES_ENABLED: true,
  FEATURE_KNOWLEDGE_SCOPE_ENABLED: true,
  FEATURE_CONVERSATION_FEEDBACK_ENABLED: true,
  FEATURE_OPENAPI_ENABLED: true,
  FEATURE_RATE_LIMITING_ENABLED: true,
  FEATURE_RUNTIME_MEMORY_ENABLED: true,
  FEATURE_SKILLS_ENABLED: true,
  FEATURE_TEAMS_ENABLED: true,
  FEATURE_TRACE_LINKS_ENABLED: true,
  NODE_ENV: 'test',
});

function config(): ConfigService {
  return {
    getOrThrow: vi.fn((key: keyof typeof configuredFlags) => configuredFlags[key]),
  } as unknown as ConfigService;
}

describe('FeatureFlagsService', () => {
  it('publishes a complete manifest matching the shared contract', () => {
    const manifest = new FeatureFlagsService(config()).getPublicFlags();
    expect(Object.keys(manifest).sort()).toEqual([...FEATURE_FLAG_NAMES].sort());
    expect(featureFlagsSchema.parse(manifest)).toEqual(manifest);
  });
  it('disables implemented capabilities explicitly without exposing operational flags', () => {
    const service = new FeatureFlagsService(
      new ConfigService({
        ...configuredFlags,
        FEATURE_GOOGLE_OAUTH_ENABLED: false,
        FEATURE_SKILLS_ENABLED: false,
        FEATURE_OPENAPI_ENABLED: false,
        FEATURE_RATE_LIMITING_ENABLED: false,
      }),
    );
    expect(service.isEnabled('googleOAuth')).toBe(false);
    expect(service.isEnabled('skills')).toBe(false);
    expect(service.isEnabled('openApi')).toBe(false);
    expect(service.isEnabled('rateLimiting')).toBe(false);
    expect(service.getPublicFlags()).not.toHaveProperty('openApi');
    expect(service.getPublicFlags()).not.toHaveProperty('rateLimiting');
  });

  it('keeps the effective OpenAPI capability disabled in production', () => {
    const service = new FeatureFlagsService(
      new ConfigService({ ...configuredFlags, NODE_ENV: 'production' }),
    );
    expect(service.isEnabled('openApi')).toBe(false);
  });
  it('creates an immutable typed snapshot from environment configuration', () => {
    const service = new FeatureFlagsService(config());

    expect(service.getPublicFlags()).toEqual({
      agentRuntime: true,
      agUiStreaming: false,
      fileUploads: false,
      generativeUi: false,
      googleOAuth: true,
      mcpApps: false,
      outputStyles: false,
      knowledgeScope: false,
      conversationFeedback: false,
      runtimeMemory: false,
      skills: true,
      teams: false,
      traceLinks: true,
    });
    expect(Object.isFrozen(service.getPublicFlags())).toBe(true);
    expect(new FeatureFlagsController(service).getFlags()).toEqual({
      data: service.getPublicFlags(),
      success: true,
    });
  });

  it('provides one authoritative lookup for route guards and services', () => {
    const service = new FeatureFlagsService(config());

    expect(service.isEnabled('googleOAuth')).toBe(true);
    expect(service.isEnabled('skills')).toBe(true);
    expect(service.isEnabled('traceLinks')).toBe(true);
    expect(service.isEnabled('agentRuntime')).toBe(true);
    expect(service.isEnabled('rateLimiting')).toBe(true);
  });

  it('does not unlock reserved product surfaces when their implementation is absent', () => {
    const service = new FeatureFlagsService(config());
    const guard = new FeatureFlagGuard(new Reflector(), service);
    const controller = class ReservedController {};
    Reflect.defineMetadata('alfred:required-feature-flags', ['agUiStreaming'], controller);

    expect(service.isEnabled('agUiStreaming')).toBe(false);
    expect(() =>
      guard.canActivate({
        getClass: () => controller,
        getHandler: () => function handler() {},
      } as unknown as ExecutionContext),
    ).toThrow(NotFoundException);
  });

  it.each<FeatureFlagName>([
    'agUiStreaming',
    'fileUploads',
    'generativeUi',
    'mcpApps',
    'outputStyles',
    'knowledgeScope',
    'conversationFeedback',
    'runtimeMemory',
    'teams',
  ])('keeps %s unavailable until its execution path is implemented', (feature) => {
    const service = new FeatureFlagsService(config());

    expect(service.isEnabled(feature)).toBe(false);
    expect(service.getPublicFlags()[feature]).toBe(false);
    const controller = class ReservedController {};
    Reflect.defineMetadata('alfred:required-feature-flags', [feature], controller);
    const guard = new FeatureFlagGuard(new Reflector(), service);
    expect(() =>
      guard.canActivate({
        getClass: () => controller,
        getHandler: () => function handler() {},
      } as unknown as ExecutionContext),
    ).toThrow(NotFoundException);
  });
});
