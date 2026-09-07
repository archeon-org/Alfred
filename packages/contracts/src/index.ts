import { z } from 'zod/mini';
export { listEnvelopeSchema, listQuerySchema } from './pagination';
export { API_ERROR_CODES, apiErrorSchema, type ApiError, type ApiErrorCode } from './errors';

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
  }),
);
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

export { successEnvelopeSchema } from './envelope';
