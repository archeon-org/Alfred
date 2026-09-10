import { z } from 'zod/mini';
import { successEnvelopeSchema } from './envelope';

const membershipScopeSchema = z.readonly(
  z.object({
    id: z.uuid(),
    name: z.string().check(z.trim(), z.minLength(1), z.maxLength(160)),
  }),
);

/** Organisational membership only; does not grant access to other users' resources. */
export const currentWorkspacesSchema = z.readonly(
  z.object({
    tenant: membershipScopeSchema,
    workspaces: z.readonly(z.array(membershipScopeSchema)),
  }),
);
export type CurrentWorkspaces = z.infer<typeof currentWorkspacesSchema>;
export const currentWorkspacesEnvelopeSchema = successEnvelopeSchema(currentWorkspacesSchema);
