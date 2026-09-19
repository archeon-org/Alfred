import { AGENT_CATALOG_MAX_ITEMS } from '@alfred/contracts';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ASSISTANT_MAX_PAGES,
  ASSISTANT_PAGE_SIZE,
  LangGraphAgentCatalog,
} from '@api/modules/agents/infrastructure/langgraph-agent-catalog';
import { RuntimeClientError } from '@api/modules/executions/application/runtime-client.port';

const catalog = () =>
  new LangGraphAgentCatalog(
    new ConfigService({ AGENT_RUNTIME_URL: 'https://private-runtime.example/' }),
  );
const signal = () => new AbortController().signal;
const mockFetch = () => vi.stubGlobal('fetch', vi.fn()).mocked(fetch);
const assistant = (index: number, isSubagent: boolean | null) => ({
  assistant_id: `assistant-${index}`,
  graph_id: `graph_${index}`,
  name: `Agent ${index}`,
  description:
    isSubagent === null
      ? null
      : JSON.stringify({ is_subagent: isSubagent, short_description: `Agent ${index}` }),
});

/** A runtime holding `total` assistants, every third one a root assistant, served by offset. */
function runtimeWith(total: number) {
  return mockFetch().mockImplementation((_url, init) => {
    const { limit, offset } = JSON.parse(init?.body as string) as {
      limit: number;
      offset: number;
    };
    const count = Math.max(0, Math.min(limit, total - offset));
    return Promise.resolve(
      Response.json(
        Array.from({ length: count }, (_, index) =>
          assistant(offset + index, (offset + index) % 3 !== 0),
        ),
      ),
    );
  });
}
const subAgentsAmong = (total: number) =>
  Array.from({ length: total }, (_, index) => index).filter((index) => index % 3 !== 0).length;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LangGraphAgentCatalog', () => {
  it('searches every assistant page and keeps only declared sub-agents', async () => {
    const firstPage = Array.from({ length: ASSISTANT_PAGE_SIZE }, (_, index) =>
      assistant(index, index % 2 === 0),
    );
    const request = mockFetch()
      .mockResolvedValueOnce(Response.json(firstPage))
      .mockResolvedValueOnce(Response.json([assistant(20, true), assistant(21, null)]));

    const agents = await catalog().listSubAgents(signal());

    expect(agents.map((agent) => agent.id)).toEqual([
      ...Array.from({ length: 10 }, (_, index) => `assistant-${index * 2}`),
      'assistant-20',
    ]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[0]).toBe('https://private-runtime.example/assistants/search');
    const init = request.mock.calls[1]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('error');
    expect(JSON.parse(init?.body as string)).toEqual({
      limit: ASSISTANT_PAGE_SIZE,
      offset: ASSISTANT_PAGE_SIZE,
      sort_by: 'name',
      sort_order: 'asc',
      select: ['assistant_id', 'graph_id', 'name', 'description'],
    });
  });

  it('returns a catalog one assistant below its bound after its last, partial page', async () => {
    const request = runtimeWith(AGENT_CATALOG_MAX_ITEMS - 1);

    const agents = await catalog().listSubAgents(signal());

    expect(agents).toHaveLength(subAgentsAmong(AGENT_CATALOG_MAX_ITEMS - 1));
    expect(request).toHaveBeenCalledTimes(ASSISTANT_MAX_PAGES);
  });

  it('returns a catalog of exactly its bound once no assistant exists beyond it', async () => {
    const request = runtimeWith(AGENT_CATALOG_MAX_ITEMS);

    const agents = await catalog().listSubAgents(signal());

    expect(agents).toHaveLength(subAgentsAmong(AGENT_CATALOG_MAX_ITEMS));
    expect(new Set(agents.map((agent) => agent.id)).size).toBe(agents.length);
    // Ten full pages, then one bounded look beyond the last one.
    expect(request).toHaveBeenCalledTimes(ASSISTANT_MAX_PAGES + 1);
    expect(JSON.parse(request.mock.calls.at(-1)?.[1]?.body as string)).toMatchObject({
      limit: 1,
      offset: AGENT_CATALOG_MAX_ITEMS,
    });
  });

  it('refuses a catalog larger than its bound rather than returning part of it', async () => {
    const request = runtimeWith(AGENT_CATALOG_MAX_ITEMS + 1);

    await expect(catalog().listSubAgents(signal())).rejects.toEqual(
      new RuntimeClientError('runtime_response_limit'),
    );
    expect(request).toHaveBeenCalledTimes(ASSISTANT_MAX_PAGES + 1);
  });

  it('rejects a look beyond the bound that answers more than it asked', async () => {
    const fullPage = Array.from({ length: ASSISTANT_PAGE_SIZE }, (_, index) =>
      assistant(index, true),
    );
    mockFetch().mockImplementation(() => Promise.resolve(Response.json(fullPage)));

    await expect(catalog().listSubAgents(signal())).rejects.toMatchObject({
      code: 'runtime_response_invalid',
    });
    expect(fetch).toHaveBeenCalledTimes(ASSISTANT_MAX_PAGES + 1);
  });

  it('maps runtime failures to safe codes without reading their body', async () => {
    mockFetch().mockResolvedValueOnce(Response.json({ detail: 'secret' }, { status: 500 }));
    await expect(catalog().listSubAgents(signal())).rejects.toMatchObject({
      code: 'runtime_unavailable',
    });
  });

  it('rejects a response that is not a page of assistants', async () => {
    mockFetch().mockResolvedValueOnce(Response.json({ items: [] }));
    await expect(catalog().listSubAgents(signal())).rejects.toMatchObject({
      code: 'runtime_response_invalid',
    });
  });

  it('turns a network failure into an unavailable runtime', async () => {
    mockFetch().mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(catalog().listSubAgents(signal())).rejects.toMatchObject({
      code: 'runtime_unavailable',
    });
  });
});
