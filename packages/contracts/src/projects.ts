import { z } from 'zod/mini';

import { successEnvelopeSchema } from './envelope';
import { listEnvelopeSchema } from './pagination';

export const PROJECT_NAME_MAX_LENGTH = 160;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 2000;
export const PROJECT_CONTEXT_MAX_BYTES = 65_536;
/** Pinned projects form one short, hand-curated page; pinning beyond this limit is refused. */
export const PROJECT_PIN_LIMIT = 100;

/** One line of printable text: no ASCII control character, including line breaks. */
// eslint-disable-next-line no-control-regex -- rejecting control characters is the purpose.
export const RESOURCE_NAME_PATTERN = /^[^\u0000-\u001f\u007f]+$/u;
/** Free text stored in PostgreSQL `text`: any character except NUL. */
// eslint-disable-next-line no-control-regex -- PostgreSQL text columns cannot store NUL.
export const RESOURCE_TEXT_PATTERN = /^[^\u0000]*$/u;

export const projectKindSchema = z.enum(['implicit', 'named']);
export type ProjectKind = z.infer<typeof projectKindSchema>;

export const projectStatusSchema = z.enum(['active', 'archived', 'deleting']);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

const isoDateTime = z.iso.datetime();

export const resourceNameSchema = z
  .string()
  .check(
    z.trim(),
    z.minLength(1),
    z.maxLength(PROJECT_NAME_MAX_LENGTH),
    z.regex(RESOURCE_NAME_PATTERN),
  );

export const projectDescriptionSchema = z
  .string()
  .check(z.maxLength(PROJECT_DESCRIPTION_MAX_LENGTH), z.regex(RESOURCE_TEXT_PATTERN));

export const projectContextSchema = z.string().check(
  z.regex(RESOURCE_TEXT_PATTERN),
  z.refine((value) => new TextEncoder().encode(value).byteLength <= PROJECT_CONTEXT_MAX_BYTES, {
    message: `Context must not exceed ${PROJECT_CONTEXT_MAX_BYTES} bytes`,
  }),
);

/** Public project shape. Tenant and owner identifiers never leave the API. */
export const projectSchema = z.readonly(
  z.object({
    id: z.uuid(),
    kind: projectKindSchema,
    name: z.nullable(z.string()),
    description: z.nullable(z.string()),
    context: z.nullable(z.string()),
    status: projectStatusSchema,
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
    archivedAt: z.nullable(isoDateTime),
    /** Set when the owner pins the project; pinned lists follow this timestamp. */
    pinnedAt: z.nullable(isoDateTime),
  }),
);
export type Project = z.infer<typeof projectSchema>;

export const createProjectInputSchema = z.object({
  name: resourceNameSchema,
  description: z.optional(projectDescriptionSchema),
  context: z.optional(projectContextSchema),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = z
  .object({
    name: z.optional(resourceNameSchema),
    description: z.optional(projectDescriptionSchema),
    context: z.optional(projectContextSchema),
  })
  .check(
    z.refine((value) => Object.values(value).some((field) => field !== undefined), {
      message: 'At least one field must be provided',
    }),
  );
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

export const projectEnvelopeSchema = successEnvelopeSchema(projectSchema);
export const projectListEnvelopeSchema = listEnvelopeSchema(projectSchema);
