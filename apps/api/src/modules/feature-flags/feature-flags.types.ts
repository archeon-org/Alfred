import type { FeatureFlagName, FeatureFlags } from '@alfred/contracts';

export type OperationalFeatureFlagName = 'rateLimiting' | 'openApi';
export type BackendFeatureFlagName = FeatureFlagName | OperationalFeatureFlagName;
export type BackendFeatureFlags = Readonly<
  FeatureFlags & Record<OperationalFeatureFlagName, boolean>
>;

export const FEATURE_FLAG_ENVIRONMENT_KEYS = Object.freeze({
  agentRuntime: 'FEATURE_AGENT_RUNTIME_ENABLED',
  agUiStreaming: 'FEATURE_AG_UI_STREAMING_ENABLED',
  fileUploads: 'FEATURE_FILE_UPLOADS_ENABLED',
  generativeUi: 'FEATURE_GENERATIVE_UI_ENABLED',
  googleOAuth: 'FEATURE_GOOGLE_OAUTH_ENABLED',
  mcpApps: 'FEATURE_MCP_APPS_ENABLED',
  outputStyles: 'FEATURE_OUTPUT_STYLES_ENABLED',
  knowledgeScope: 'FEATURE_KNOWLEDGE_SCOPE_ENABLED',
  conversationFeedback: 'FEATURE_CONVERSATION_FEEDBACK_ENABLED',
  openApi: 'FEATURE_OPENAPI_ENABLED',
  rateLimiting: 'FEATURE_RATE_LIMITING_ENABLED',
  runtimeMemory: 'FEATURE_RUNTIME_MEMORY_ENABLED',
  skills: 'FEATURE_SKILLS_ENABLED',
  teams: 'FEATURE_TEAMS_ENABLED',
  traceLinks: 'FEATURE_TRACE_LINKS_ENABLED',
} as const satisfies Readonly<Record<BackendFeatureFlagName, string>>);

export type { FeatureFlagName, FeatureFlags } from '@alfred/contracts';
