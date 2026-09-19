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

    const [first, second] = await Promise.all([service.list(), service.list()]);
    expect(first).toEqual({ items: [agent] });
    expect(second).toBe(first);
    await service.list();
    expect(port.listSubAgents).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(AGENT_CATALOG_CACHE_MS + 1);
    await service.list();
    expect(port.listSubAgents).toHaveBeenCalledTimes(2);
  });

  it('fails closed with a stable code and no stale list', async () => {
    vi.useFakeTimers();
    const { port, service } = runtime();
    port.listSubAgents.mockResolvedValueOnce([agent]);
    await service.list();
    vi.advanceTimersByTime(AGENT_CATALOG_CACHE_MS + 1);
    port.listSubAgents.mockRejectedValueOnce(new RuntimeClientError('runtime_unavailable'));

    const failure = await service.list().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiException);
    expect((failure as ApiException).getStatus()).toBe(503);
    expect((failure as ApiException).code).toBe('agent_catalog_unavailable');

    port.listSubAgents.mockResolvedValueOnce([]);
    await expect(service.list()).resolves.toEqual({ items: [] });
  });
});
