import type { FeatureFlags } from '@alfred/contracts';

export type { FeatureFlagName, FeatureFlags } from '@alfred/contracts';

export const DISABLED_FEATURE_FLAGS: Readonly<FeatureFlags> = Object.freeze({
  agentRuntime: false,
  agUiStreaming: false,
  fileUploads: false,
  generativeUi: false,
  googleOAuth: false,
  mcpApps: false,
  outputStyles: false,
  knowledgeScope: false,
  conversationFeedback: false,
  runtimeMemory: false,
  skills: false,
  teams: false,
});
