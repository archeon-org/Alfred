import type { AgentSummary } from '@alfred/contracts';

/** Read side of the runtime's agent catalog (ALF-DEC-052: the runtime deployment owns it). */
export interface AgentCatalogPort {
  listSubAgents(signal: AbortSignal): Promise<readonly AgentSummary[]>;
}

export const AGENT_CATALOG = Symbol('AGENT_CATALOG');
