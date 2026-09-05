import { z } from 'zod/mini';

const nonEmptyString = z.string().check(z.trim(), z.minLength(1));

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

export const FEATURE_FLAG_NAMES = Object.freeze([
  'agentRuntime',
  'agUiStreaming',
  'fileUploads',
  'generativeUi',
  'googleOAuth',
  'mcpApps',
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
    runtimeMemory: z.boolean(),
    skills: z.boolean(),
    teams: z.boolean(),
  }),
);
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

export function successEnvelopeSchema<T extends z.ZodMiniType>(data: T) {
  return z.readonly(z.object({ data, success: z.literal(true) }));
}
