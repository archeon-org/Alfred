import { z } from 'zod/mini';

import { successEnvelopeSchema } from './envelope';
import { listEnvelopeSchema } from './pagination';
import { projectKindSchema, resourceNameSchema } from './projects';

export const CONVERSATION_TITLE_MAX_LENGTH = 160;
export const DEFAULT_CONVERSATION_TITLE = 'Nouvelle conversation';

export const conversationTitleSourceSchema = z.enum(['none', 'auto', 'user']);
export type ConversationTitleSource = z.infer<typeof conversationTitleSourceSchema>;

const isoDateTime = z.iso.datetime();

/** Public conversation shape. Runtime thread identifiers are private and never exposed. */
export const conversationSchema = z.readonly(
  z.object({
    id: z.uuid(),
    projectId: z.uuid(),
    projectKind: projectKindSchema,
    title: z.string(),
    titleSource: conversationTitleSourceSchema,
    pinnedAt: z.nullable(isoDateTime),
    lastActivityAt: z.nullable(isoDateTime),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
    archivedAt: z.nullable(isoDateTime),
  }),
);
export type Conversation = z.infer<typeof conversationSchema>;

/** Without `projectId`, the API creates a private implicit project for the new chat. */
export const createConversationInputSchema = z.object({
  projectId: z.optional(z.uuid()),
  title: z.optional(resourceNameSchema),
});
export type CreateConversationInput = z.infer<typeof createConversationInputSchema>;

export const conversationEnvelopeSchema = successEnvelopeSchema(conversationSchema);
export const conversationListEnvelopeSchema = listEnvelopeSchema(conversationSchema);

export const updateConversationInputSchema = z.object({ title: resourceNameSchema });
export type UpdateConversationInput = z.infer<typeof updateConversationInputSchema>;

export const moveConversationInputSchema = z.object({ projectId: z.uuid() });
export type MoveConversationInput = z.infer<typeof moveConversationInputSchema>;
