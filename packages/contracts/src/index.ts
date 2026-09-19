import { z } from 'zod/mini';
export { listEnvelopeSchema, listQuerySchema } from './pagination';
export { API_ERROR_CODES, apiErrorSchema, type ApiError, type ApiErrorCode } from './errors';
export {
  PROJECT_CONTEXT_MAX_BYTES,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_PIN_LIMIT,
  RESOURCE_NAME_PATTERN,
  RESOURCE_TEXT_PATTERN,
  createProjectInputSchema,
  projectContextSchema,
  projectDescriptionSchema,
  projectEnvelopeSchema,
  projectKindSchema,
  projectListEnvelopeSchema,
  projectSchema,
  projectStatusSchema,
  resourceNameSchema,
  updateProjectInputSchema,
  type CreateProjectInput,
  type Project,
  type ProjectKind,
  type ProjectStatus,
  type UpdateProjectInput,
} from './projects';
export {
  CONVERSATION_TITLE_MAX_LENGTH,
  DEFAULT_CONVERSATION_TITLE,
  conversationEnvelopeSchema,
  conversationListEnvelopeSchema,
  conversationSchema,
  conversationTitleSourceSchema,
  createConversationInputSchema,
  updateConversationInputSchema,
  moveConversationInputSchema,
  type MoveConversationInput,
  type UpdateConversationInput,
  type Conversation,
  type ConversationTitleSource,
  type CreateConversationInput,
} from './conversations';
export {
  EXECUTION_MESSAGE_MAX_LENGTH,
  EXECUTION_STREAM_ERROR_EVENT,
  EXECUTION_STREAM_UNAVAILABLE_CODE,
  EXECUTION_TOOL_RESULT_CONTENTS,
  EXECUTION_JSON_PROFILE,
  EXECUTION_OUTPUT_MAX_LENGTH,
  alfredRunStateSchema,
  executionActivitySchema,
  executionSnapshotSchema,
  executionSnapshotEnvelopeSchema,
  activeExecutionEnvelopeSchema,
  executionSchema,
  executionStatusSchema,
  messageListEnvelopeSchema,
  messageRoleSchema,
  messageSchema,
  startExecutionInputSchema,
  type AlfredRunState,
  type Execution,
  type ExecutionStatus,
  type ExecutionStreamEvent,
  type ExecutionActivity,
  type ExecutionSnapshot,
  type Message,
  type MessageRole,
  type StartExecutionInput,
  EXECUTION_TRACE_LINK_MAX_LENGTH,
  executionTraceLinkEnvelopeSchema,
  executionTraceLinkSchema,
  isCredentialFreeUrl,
  type ExecutionTraceLink,
} from './executions';
export { contentText, createAssistantReply, type AssistantReply } from './assistant-reply';

const nonEmptyString = z.string().check(z.trim(), z.minLength(1));
const authProviderId = z.string().check(z.regex(/^[a-z][a-z0-9-]*$/u), z.maxLength(64));

export const userRoleSchema = z.enum(['admin', 'user']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const publicUserSchema = z.readonly(
  z.object({
    avatarUrl: z.optional(z.url()),
    displayName: nonEmptyString,
    email: nonEmptyString,
    id: nonEmptyString,
    role: userRoleSchema,
  }),
);
export type PublicUser = z.infer<typeof publicUserSchema>;

export const sessionDataSchema = z.readonly(
  z.object({
    accessToken: nonEmptyString,
    user: publicUserSchema,
  }),
);
export type SessionData = z.infer<typeof sessionDataSchema>;

export const authProviderSchema = z.readonly(
  z.object({
    displayName: nonEmptyString.check(z.maxLength(80)),
    id: authProviderId,
  }),
);
export type AuthProvider = z.infer<typeof authProviderSchema>;
export const authProvidersSchema = z.readonly(z.array(authProviderSchema));

export const FEATURE_FLAG_NAMES = Object.freeze([
  'agentRuntime',
  'agUiStreaming',
  'fileUploads',
  'generativeUi',
  'googleOAuth',
  'mcpApps',
  'outputStyles',
  'knowledgeScope',
  'conversationFeedback',
  'runtimeMemory',
  'skills',
  'teams',
  'traceLinks',
] as const);
export type FeatureFlagName = (typeof FEATURE_FLAG_NAMES)[number];

export const featureFlagsSchema = z.readonly(
  z.object({
    agentRuntime: z.boolean(),
    agUiStreaming: z.boolean(),
    fileUploads: z.boolean(),
    generativeUi: z.boolean(),
    googleOAuth: z.boolean(),
    mcpApps: z.boolean(),
    outputStyles: z.boolean(),
    knowledgeScope: z.boolean(),
    conversationFeedback: z.boolean(),
    runtimeMemory: z.boolean(),
    skills: z.boolean(),
    teams: z.boolean(),
    // Added 2026-09-16: a manifest from an older API omits it and reads as disabled.
    traceLinks: z._default(z.boolean(), false),
  }),
);
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

export { successEnvelopeSchema } from './envelope';

export {
  CONTEXT_DOCUMENT_MAX_BYTES,
  contextDocumentKindSchema,
  contextDocumentSchema,
  contextDocumentSetSchema,
  saveContextDocumentInputSchema,
  contextDocumentEnvelopeSchema,
  contextDocumentSetEnvelopeSchema,
  type ContextDocumentKind,
  type ContextDocument,
  type ContextDocumentSet,
  type SaveContextDocumentInput,
} from './context';

export * from './skills';

export {
  currentWorkspacesSchema,
  currentWorkspacesEnvelopeSchema,
  type CurrentWorkspaces,
} from './workspaces';
