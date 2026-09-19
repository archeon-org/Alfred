import type { AgentSummary } from '@alfred/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentCatalogPort } from '@api/modules/agents/application/agent-catalog.port';
import {
  AGENT_CATALOG_CACHE_MS,
  AgentCatalogService,
} from '@api/modules/agents/application/agent-catalog.service';
import { ApiException } from '@api/common/errors/api.exception';
import { RuntimeClientError } from '@api/modules/executions/application/runtime-client.port';

const agent: AgentSummary = {
  id: 'assistant-1',
  graphId: 'topology',
  name: 'topology',
  shortDescription: null,
  description: null,
  tags: [],
};
const query = { limit: 20 };
const runtime = () => {
  const port = { listSubAgents: vi.fn<AgentCatalogPort['listSubAgents']>() };
  return { port, service: new AgentCatalogService(port) };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('AgentCatalogService', () => {
  it('shares one runtime round trip between concurrent callers and caches it briefly', async () => {
    vi.useFakeTimers();
    const { port, service } = runtime();
    port.listSubAgents.mockResolvedValue([agent]);

    const [first, second] = await Promise.all([service.list(query), service.list(query)]);
    expect(first).toEqual({ items: [agent], nextCursor: null });
    expect(second).toEqual(first);
    await service.list(query);
    expect(port.listSubAgents).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(AGENT_CATALOG_CACHE_MS + 1);
    await service.list(query);
    expect(port.listSubAgents).toHaveBeenCalledTimes(2);
  });

  it('fails closed with a stable code and no stale list', async () => {
    vi.useFakeTimers();
    const { port, service } = runtime();
    port.listSubAgents.mockResolvedValueOnce([agent]);
    await service.list(query);
    vi.advanceTimersByTime(AGENT_CATALOG_CACHE_MS + 1);
    port.listSubAgents.mockRejectedValueOnce(new RuntimeClientError('runtime_unavailable'));

    const failure = await service.list(query).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiException);
    expect((failure as ApiException).getStatus()).toBe(503);
    expect((failure as ApiException).code).toBe('agent_catalog_unavailable');

    port.listSubAgents.mockResolvedValueOnce([]);
    await expect(service.list(query)).resolves.toEqual({ items: [], nextCursor: null });
  });

  it('searches the cached catalog and maps cursor refusals to stable codes', async () => {
    vi.useFakeTimers();
    const { port, service } = runtime();
    const elastic = { ...agent, id: 'assistant-2', graphId: 'elastic_rag', name: 'elastic_rag' };
    port.listSubAgents.mockResolvedValue([agent, elastic]);

    await expect(service.list({ limit: 20, search: 'RAG' })).resolves.toMatchObject({
      items: [{ name: 'elastic_rag' }],
    });
    const first = await service.list({ limit: 1 });
    expect(first.items).toEqual([elastic]);
    expect(port.listSubAgents).toHaveBeenCalledOnce();

    const refusal = async (cursor: string) => {
      const error = await service.list({ limit: 1, cursor }).catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(ApiException);
      return { status: (error as ApiException).getStatus(), code: (error as ApiException).code };
    };
    expect(await refusal('not-a-cursor')).toEqual({ status: 400, code: 'invalid_cursor' });

    // An identical reload keeps the cursor; changed content asks the reader to restart.
    vi.advanceTimersByTime(AGENT_CATALOG_CACHE_MS + 1);
    await expect(service.list({ limit: 1, cursor: first.nextCursor ?? '' })).resolves.toEqual({
      items: [agent],
      nextCursor: null,
    });
    expect(port.listSubAgents).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(AGENT_CATALOG_CACHE_MS + 1);
    port.listSubAgents.mockResolvedValue([{ ...agent, name: 'renamed' }, elastic]);
    expect(await refusal(first.nextCursor ?? '')).toEqual({
      status: 409,
      code: 'agent_catalog_changed',
    });
  });
});
