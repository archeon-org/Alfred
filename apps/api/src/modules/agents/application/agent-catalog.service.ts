import type { AgentCatalog } from '@alfred/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../../../common/errors/api.exception';
import { AGENT_CATALOG, type AgentCatalogPort } from './agent-catalog.port';

/** The catalog is the same for every caller, so a short shared cache spares the runtime. */
export const AGENT_CATALOG_CACHE_MS = 30_000;

@Injectable()
export class AgentCatalogService {
  private readonly logger = new Logger(AgentCatalogService.name);
  private cached: { readonly catalog: AgentCatalog; readonly expiresAt: number } | null = null;
  private pending: Promise<AgentCatalog> | null = null;

  constructor(@Inject(AGENT_CATALOG) private readonly runtime: AgentCatalogPort) {}

  async list(): Promise<AgentCatalog> {
    if (this.cached !== null && this.cached.expiresAt > Date.now()) return this.cached.catalog;
    // Concurrent panel mounts share one runtime round trip.
    this.pending ??= this.load().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async load(): Promise<AgentCatalog> {
    try {
      const items = await this.runtime.listSubAgents(new AbortController().signal);
      const catalog: AgentCatalog = Object.freeze({ items: Object.freeze([...items]) });
      this.cached = { catalog, expiresAt: Date.now() + AGENT_CATALOG_CACHE_MS };
      return catalog;
    } catch (error) {
      // Fail closed: no stale or fallback list (ALF-DEC-005 §11). Runtime details stay private.
      this.cached = null;
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'unknown';
      this.logger.warn(`Agent catalog unavailable (${code})`);
      throw new ApiException(
        503,
        'agent_catalog_unavailable',
        'The agent catalog is temporarily unavailable.',
      );
    }
  }
}
