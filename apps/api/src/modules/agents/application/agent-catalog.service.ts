import type { AgentPage } from '@alfred/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../../../common/errors/api.exception';
import {
  pageAgents,
  snapshotCatalog,
  type AgentCatalogSnapshot,
  type AgentSearchQuery,
} from '../domain/agent-search';
import { AGENT_CATALOG, type AgentCatalogPort } from './agent-catalog.port';

/** The catalog is the same for every caller, so a short shared cache spares the runtime. */
export const AGENT_CATALOG_CACHE_MS = 30_000;

type Catalog = AgentCatalogSnapshot;

@Injectable()
export class AgentCatalogService {
  private readonly logger = new Logger(AgentCatalogService.name);
  private cached: { readonly catalog: Catalog; readonly expiresAt: number } | null = null;
  private pending: Promise<Catalog> | null = null;

  constructor(@Inject(AGENT_CATALOG) private readonly runtime: AgentCatalogPort) {}

  /** One page of the declared sub-agents; while the cache is valid, no runtime call is made. */
  async list(query: AgentSearchQuery): Promise<AgentPage> {
    const result = pageAgents(await this.catalog(), query);
    if (result.kind === 'invalid_cursor') {
      throw new ApiException(400, 'invalid_cursor', 'Invalid pagination cursor.');
    }
    if (result.kind === 'catalog_changed') {
      // The client restarts from the first page instead of mixing two catalog versions.
      throw new ApiException(
        409,
        'agent_catalog_changed',
        'The agent catalog changed; reload the list from the first page.',
      );
    }
    return result.page;
  }

  private async catalog(): Promise<Catalog> {
    if (this.cached !== null && this.cached.expiresAt > Date.now()) return this.cached.catalog;
    // Concurrent panel mounts and keystrokes share one runtime round trip.
    this.pending ??= this.load().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async load(): Promise<Catalog> {
    try {
      const items = await this.runtime.listSubAgents(new AbortController().signal);
      const catalog = snapshotCatalog(items);
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
