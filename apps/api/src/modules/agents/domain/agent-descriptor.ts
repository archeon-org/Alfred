import {
  AGENT_DESCRIPTION_MAX_LENGTH,
  AGENT_MAX_TAGS,
  AGENT_NAME_MAX_LENGTH,
  AGENT_SHORT_DESCRIPTION_MAX_LENGTH,
  AGENT_TAG_MAX_LENGTH,
  type AgentSummary,
} from '@alfred/contracts';
import { z } from 'zod';

/** The native assistant fields the catalog selects; anything else stays in the runtime. */
export const runtimeAssistantSchema = z.object({
  assistant_id: z.string().min(1).max(128),
  graph_id: z.string().min(1).max(128),
  name: z.string().max(10_000),
  description: z.string().max(100_000).nullable().optional(),
});
export type RuntimeAssistant = z.infer<typeof runtimeAssistantSchema>;

/**
 * The runtime stores its catalog metadata as a JSON string in `description`. Only an exact
 * `is_subagent: true` makes an assistant a specialist; the other keys are optional and loose.
 */
const descriptorSchema = z.object({
  is_subagent: z.literal(true),
  description: z.unknown().optional(),
  short_description: z.unknown().optional(),
  tags: z.unknown().optional(),
});

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

function tags(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const valid = value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '' && tag.length <= AGENT_TAG_MAX_LENGTH);
  return [...new Set(valid)].slice(0, AGENT_MAX_TAGS);
}

/** Returns the public summary of a sub-agent, or `null` for any other or unreadable assistant. */
export function toSubAgentSummary(assistant: RuntimeAssistant): AgentSummary | null {
  if (typeof assistant.description !== 'string') return null;
  let metadata: unknown;
  try {
    metadata = JSON.parse(assistant.description) as unknown;
  } catch {
    return null;
  }
  const descriptor = descriptorSchema.safeParse(metadata);
  if (!descriptor.success) return null;
  const name = text(assistant.name, AGENT_NAME_MAX_LENGTH) ?? assistant.graph_id;
  return {
    id: assistant.assistant_id,
    graphId: assistant.graph_id,
    name: name.slice(0, AGENT_NAME_MAX_LENGTH),
    shortDescription: text(descriptor.data.short_description, AGENT_SHORT_DESCRIPTION_MAX_LENGTH),
    description: text(descriptor.data.description, AGENT_DESCRIPTION_MAX_LENGTH),
    tags: tags(descriptor.data.tags),
  };
}
