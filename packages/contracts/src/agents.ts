import { z } from 'zod/mini';
import { listEnvelopeSchema } from './pagination';

export const AGENT_NAME_MAX_LENGTH = 120;
export const AGENT_SHORT_DESCRIPTION_MAX_LENGTH = 280;
export const AGENT_DESCRIPTION_MAX_LENGTH = 2_000;
export const AGENT_TAG_MAX_LENGTH = 40;
export const AGENT_MAX_TAGS = 16;
export const AGENT_CATALOG_MAX_ITEMS = 200;
export const AGENT_SEARCH_MAX_LENGTH = 100;

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

/** One page of the catalog, filtered by `search` and ordered by name (`GET /api/agents`). */
export const agentListEnvelopeSchema = listEnvelopeSchema(agentSummarySchema);
export interface AgentPage {
  readonly items: readonly AgentSummary[];
  readonly nextCursor: string | null;
}

/**
 * Turns a runtime graph name into a readable label: separators become spaces and the first letter
 * is capitalised, while inner casing (acronyms such as `LightRAG`, `HTTP`) is kept.
 * `base_react_basic` → `Base react basic`, `CFTAgent_LightRAG_HTTP` → `CFTAgent LightRAG HTTP`.
 */
export function agentDisplayName(name: string): string {
  const label = name.replace(/[_-]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  if (label.length === 0) return name;
  return label.charAt(0).toLocaleUpperCase('fr') + label.slice(1);
}
