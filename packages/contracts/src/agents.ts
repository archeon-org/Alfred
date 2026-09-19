import { z } from 'zod/mini';
import { successEnvelopeSchema } from './envelope';

export const AGENT_NAME_MAX_LENGTH = 120;
export const AGENT_SHORT_DESCRIPTION_MAX_LENGTH = 280;
export const AGENT_DESCRIPTION_MAX_LENGTH = 2_000;
export const AGENT_TAG_MAX_LENGTH = 40;
export const AGENT_MAX_TAGS = 16;
export const AGENT_CATALOG_MAX_ITEMS = 200;

/** A specialist the runtime declares as delegable (`is_subagent`); listing it grants nothing. */
export const agentSummarySchema = z.readonly(
  z.object({
    id: z.string().check(z.minLength(1), z.maxLength(128)),
    graphId: z.string().check(z.minLength(1), z.maxLength(128)),
    name: z.string().check(z.minLength(1), z.maxLength(AGENT_NAME_MAX_LENGTH)),
    shortDescription: z.nullable(z.string().check(z.maxLength(AGENT_SHORT_DESCRIPTION_MAX_LENGTH))),
    description: z.nullable(z.string().check(z.maxLength(AGENT_DESCRIPTION_MAX_LENGTH))),
    tags: z.readonly(
      z
        .array(z.string().check(z.minLength(1), z.maxLength(AGENT_TAG_MAX_LENGTH)))
        .check(z.maxLength(AGENT_MAX_TAGS)),
    ),
  }),
);
export type AgentSummary = z.infer<typeof agentSummarySchema>;

export const agentCatalogSchema = z.readonly(
  z.object({
    items: z.readonly(z.array(agentSummarySchema).check(z.maxLength(AGENT_CATALOG_MAX_ITEMS))),
  }),
);
export type AgentCatalog = z.infer<typeof agentCatalogSchema>;
export const agentCatalogEnvelopeSchema = successEnvelopeSchema(agentCatalogSchema);
