import { describe, expect, it, vi } from 'vitest';
import { AGENT_PAGE_SIZE, listAgents } from '@/services/agents/agents.service';

const client = (data: unknown, status = 200) => ({
  request: vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(data), { status }))),
});
const agent = {
  id: '98480af1-6fd5-51b1-9b43-97834987e6ea',
  graphId: 'topology',
  name: 'topology',
  shortDescription: 'AI-Ops infrastructure topology explorer.',
  description: null,
  tags: ['topology'],
};

describe('Agents HTTP boundary', () => {
  it('reads one page of the catalog through the API client', async () => {
    const http = client({ success: true, data: { items: [agent], nextCursor: 'next' } });
    await expect(listAgents(http)).resolves.toEqual({ items: [agent], nextCursor: 'next' });
    expect(http.request).toHaveBeenCalledWith(
      `/agents?limit=${AGENT_PAGE_SIZE}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('sends the cursor and a non-empty search as query parameters', async () => {
    const http = client({ success: true, data: { items: [], nextCursor: null } });
    await listAgents(http, 'abc', 'light rag');
    expect(http.request).toHaveBeenCalledWith(
      `/agents?cursor=abc&limit=${AGENT_PAGE_SIZE}&search=light+rag`,
      expect.anything(),
    );
    await listAgents(http, undefined, '');
    expect(http.request).toHaveBeenLastCalledWith(
      `/agents?limit=${AGENT_PAGE_SIZE}`,
      expect.anything(),
    );
  });

  it('fails closed on a malformed catalog', async () => {
    await expect(
      listAgents(client({ success: true, data: { items: [{ id: 'x' }], nextCursor: null } })),
    ).rejects.toThrow('Le catalogue d’agents est invalide.');
  });

  it('keeps the stable error code of an unavailable catalog', async () => {
    await expect(
      listAgents(
        client(
          {
            success: false,
            error: { code: 'agent_catalog_unavailable', message: 'Unavailable.' },
          },
          503,
        ),
      ),
    ).rejects.toMatchObject({ status: 503, code: 'agent_catalog_unavailable' });
  });
});
