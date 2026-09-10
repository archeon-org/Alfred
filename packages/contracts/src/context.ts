import { z } from 'zod/mini';
import { successEnvelopeSchema } from './envelope';

export const CONTEXT_DOCUMENT_MAX_BYTES = 65_536;
export const contextDocumentKindSchema = z.enum(['instructions', 'preferences', 'context']);
export type ContextDocumentKind = z.infer<typeof contextDocumentKindSchema>;
export const contextDocumentSchema = z.readonly(
  z.object({
    kind: contextDocumentKindSchema,
    content: z.string(),
    revision: z.number().check(z.int(), z.minimum(0)),
    contentHash: z.string().check(z.regex(/^[a-f0-9]{64}$/u)),
    updatedAt: z.nullable(z.iso.datetime()),
  }),
);
export type ContextDocument = z.infer<typeof contextDocumentSchema>;
export const contextDocumentSetSchema = z.readonly(
  z.object({
    maxBytes: z.number().check(z.int(), z.minimum(1)),
    documents: z.readonly(z.array(contextDocumentSchema)),
  }),
);
export type ContextDocumentSet = z.infer<typeof contextDocumentSetSchema>;
export const saveContextDocumentInputSchema = z.strictObject({
  content: z
    .string()
    .check(z.refine((value) => !value.includes('\0') && !/[\uD800-\uDFFF]/u.test(value))),
  expectedRevision: z.number().check(z.int(), z.minimum(0), z.maximum(2_147_483_646)),
});
export type SaveContextDocumentInput = z.infer<typeof saveContextDocumentInputSchema>;
export const contextDocumentEnvelopeSchema = successEnvelopeSchema(contextDocumentSchema);
export const contextDocumentSetEnvelopeSchema = successEnvelopeSchema(contextDocumentSetSchema);
