export const FEATURE_FLAG_ENVIRONMENT_KEYS = Object.freeze({
  agentRuntime: 'FEATURE_AGENT_RUNTIME_ENABLED',
  agUiStreaming: 'FEATURE_AG_UI_STREAMING_ENABLED',
  fileUploads: 'FEATURE_FILE_UPLOADS_ENABLED',
  generativeUi: 'FEATURE_GENERATIVE_UI_ENABLED',
  googleOAuth: 'FEATURE_GOOGLE_OAUTH_ENABLED',
  mcpApps: 'FEATURE_MCP_APPS_ENABLED',
  runtimeMemory: 'FEATURE_RUNTIME_MEMORY_ENABLED',
  skills: 'FEATURE_SKILLS_ENABLED',
  teams: 'FEATURE_TEAMS_ENABLED',
} as const satisfies Readonly<Record<FeatureFlagName, string>>);
import type { FeatureFlagName } from '@alfred/contracts';

export type { FeatureFlagName, FeatureFlags } from '@alfred/contracts';
