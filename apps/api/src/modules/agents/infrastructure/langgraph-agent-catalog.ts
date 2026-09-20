import { AGENT_CATALOG_MAX_ITEMS, type AgentSummary } from '@alfred/contracts';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { RuntimeClientError } from '../../executions/application/runtime-client.port';
import {
  assertRuntimeSuccess,
  readRuntimeJson,
  RuntimeRequestBudget,
} from '../../executions/infrastructure/langgraph/runtime-http.transport';
import type { AgentCatalogPort } from '../application/agent-catalog.port';
import { runtimeAssistantSchema, toSubAgentSummary } from '../domain/agent-descriptor';

// Small pages keep each response under the transport's JSON byte bound.
export const ASSISTANT_PAGE_SIZE = 20;
export const ASSISTANT_MAX_PAGES = AGENT_CATALOG_MAX_ITEMS / ASSISTANT_PAGE_SIZE;
export const AGENT_CATALOG_TIMEOUT_MS = 10_000;
const pageSchema = z.array(runtimeAssistantSchema).max(ASSISTANT_PAGE_SIZE);

/** Lists the native assistants (`POST /assistants/search`) and keeps the declared sub-agents. */
@Injectable()
export class LangGraphAgentCatalog implements AgentCatalogPort {
  constructor(private readonly config: ConfigService) {}

  async listSubAgents(signal: AbortSignal): Promise<readonly AgentSummary[]> {
    const budget = new RuntimeRequestBudget(signal);
    budget.arm(AGENT_CATALOG_TIMEOUT_MS, 'runtime_request_timeout');
    try {
      const agents: AgentSummary[] = [];
      for (let page = 0; page < ASSISTANT_MAX_PAGES; page += 1) {
        const assistants = await this.search(
          page * ASSISTANT_PAGE_SIZE,
          ASSISTANT_PAGE_SIZE,
          budget,
        );
        for (const assistant of assistants) {
          const agent = toSubAgentSummary(assistant);
          if (agent !== null) agents.push(agent);
        }
        if (assistants.length < ASSISTANT_PAGE_SIZE) return agents;
      }
      // Every page was full: the catalog holds exactly its bound unless one more assistant follows.
      const beyond = await this.search(AGENT_CATALOG_MAX_ITEMS, 1, budget);
      if (beyond.length === 0) return agents;
      // A partial catalog would silently hide specialists: refuse instead (ALF-DEC-005 §11).
      throw new RuntimeClientError('runtime_response_limit');
    } catch (error) {
      throw budget.safeError(error);
    } finally {
      budget.close();
    }
  }

  private async search(offset: number, limit: number, budget: RuntimeRequestBudget) {
    const response = await fetch(`${this.baseUrl()}/assistants/search`, {
      method: 'POST',
      redirect: 'error',
      signal: budget.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit,
        offset,
        sort_by: 'name',
        sort_order: 'asc',
        select: ['assistant_id', 'graph_id', 'name', 'description'],
      }),
    });
    assertRuntimeSuccess(response);
    const page = pageSchema.safeParse(await readRuntimeJson(response, budget));
    if (!page.success || page.data.length > limit)
      throw new RuntimeClientError('runtime_response_invalid');
    return page.data;
  }

  private baseUrl(): string {
    // AGENT_RUNTIME_URL is validated at startup as a credential-free HTTP(S) origin.
    const baseUrl = this.config.get<string>('AGENT_RUNTIME_URL');
    if (!baseUrl) throw new RuntimeClientError('runtime_not_configured');
    return baseUrl.replace(/\/$/u, '');
  }
}
