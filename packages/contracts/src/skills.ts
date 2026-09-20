import { z } from 'zod/mini';
import { successEnvelopeSchema } from './envelope';
import { listEnvelopeSchema } from './pagination';

export const SKILL_NAME_MAX_LENGTH = 64;
export const SKILL_DESCRIPTION_MAX_LENGTH = 1024;
export const SKILL_MAX_FILES = 50;
export const SKILL_MAX_PACKAGE_BYTES = 1_048_576;
export const SKILL_MAX_INSTRUCTIONS_BYTES = 131_072;
export const skillFileInputSchema = z.strictObject({
  path: z.string().check(z.minLength(1), z.maxLength(240)),
  contentBase64: z.string().check(z.maxLength(1_398_104)),
  mediaType: z.string().check(z.minLength(1), z.maxLength(127)),
});
export type SkillFileInput = z.infer<typeof skillFileInputSchema>;
const writeFields = {
  name: z
    .string()
    .check(
      z.minLength(1),
      z.maxLength(SKILL_NAME_MAX_LENGTH),
      z.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    ),
  description: z.string().check(z.minLength(1), z.maxLength(SKILL_DESCRIPTION_MAX_LENGTH)),
  files: z.array(skillFileInputSchema).check(z.minLength(1), z.maxLength(SKILL_MAX_FILES)),
};
export const skillWriteInputSchema = z.strictObject(writeFields);
export type SkillWriteInput = z.infer<typeof skillWriteInputSchema>;
export const skillVersionInputSchema = z.strictObject({
  expectedVersion: z.number().check(z.int(), z.minimum(1), z.maximum(2_147_483_646)),
});
export const skillUpdateInputSchema = z.strictObject({
  ...writeFields,
  ...skillVersionInputSchema.shape,
});
export type SkillUpdateInput = z.infer<typeof skillUpdateInputSchema>;
export const skillSummarySchema = z.object({
  enabled: z.boolean(),
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  version: z.number().check(z.int(), z.minimum(1)),
  currentVersion: z.number().check(z.int(), z.minimum(1)),
  publishedVersion: z.nullable(z.number().check(z.int(), z.minimum(1))),
  status: z.enum(['draft', 'published']),
  fileCount: z.number().check(z.int()),
  totalBytes: z.number().check(z.int()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type SkillSummary = z.infer<typeof skillSummarySchema>;
export const skillDetailSchema = z.object({
  ...skillSummarySchema.shape,
  files: z.array(skillFileInputSchema),
});
export type SkillDetail = z.infer<typeof skillDetailSchema>;
export const skillEnvelopeSchema = successEnvelopeSchema(skillDetailSchema);
export const skillListEnvelopeSchema = listEnvelopeSchema(skillSummarySchema);
export type CreateSkillInput = SkillWriteInput;
export type UpdateSkillInput = SkillUpdateInput;

export const skillRestoreInputSchema = z.strictObject({
  ...skillVersionInputSchema.shape,
  sourceVersion: z.number().check(z.int(), z.minimum(1), z.maximum(2_147_483_647)),
});
export type SkillRestoreInput = z.infer<typeof skillRestoreInputSchema>;
export const skillAvailabilityInputSchema = z.strictObject({
  ...skillVersionInputSchema.shape,
  enabled: z.boolean(),
});
export type SkillAvailabilityInput = z.infer<typeof skillAvailabilityInputSchema>;
export const skillVersionSummarySchema = z.object({
  version: z.number().check(z.int(), z.minimum(1)),
  name: z.string(),
  description: z.string(),
  totalBytes: z.number().check(z.int(), z.minimum(1)),
  createdAt: z.iso.datetime(),
  publishedAt: z.nullable(z.iso.datetime()),
});
export type SkillVersionSummary = z.infer<typeof skillVersionSummarySchema>;
export const skillVersionsQuerySchema = z.strictObject({
  before: z.optional(z.number().check(z.int(), z.minimum(1), z.maximum(2_147_483_647))),
  limit: z._default(z.number().check(z.int(), z.minimum(1), z.maximum(100)), 20),
});
export type SkillVersionsQuery = z.infer<typeof skillVersionsQuerySchema>;
export const skillVersionListEnvelopeSchema = successEnvelopeSchema(
  z.object({
    items: z.array(skillVersionSummarySchema),
    nextBefore: z.nullable(z.number().check(z.int(), z.minimum(1))),
  }),
);

export const skillVersionsEnvelopeSchema = skillVersionListEnvelopeSchema;

/**
 * What a consumer of skills reads: an enabled skill at its published snapshot. Name, description
 * and files are the snapshot's, so an unpublished draft (a rename included) never shows through.
 */
export const publishedSkillSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  publishedVersion: z.number().check(z.int(), z.minimum(1)),
  contentHash: z.string().check(z.regex(/^[a-f0-9]{64}$/u)),
  totalBytes: z.number().check(z.int(), z.minimum(1)),
  publishedAt: z.iso.datetime(),
});
export type PublishedSkillSummary = z.infer<typeof publishedSkillSummarySchema>;
export const publishedSkillDetailSchema = z.object({
  ...publishedSkillSummarySchema.shape,
  files: z.array(skillFileInputSchema),
});
export type PublishedSkillDetail = z.infer<typeof publishedSkillDetailSchema>;
export const publishedSkillEnvelopeSchema = successEnvelopeSchema(publishedSkillDetailSchema);
export const publishedSkillListEnvelopeSchema = listEnvelopeSchema(publishedSkillSummarySchema);
