import { describe, expect, it, vi } from 'vitest';
import { listAgents } from '@/services/agents/agents.service';

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
  it('reads the catalog through the API client', async () => {
    const http = client({ success: true, data: { items: [agent] } });
    await expect(listAgents(http)).resolves.toEqual({ items: [agent] });
    expect(http.request).toHaveBeenCalledWith(
      '/agents',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('fails closed on a malformed catalog', async () => {
    await expect(
      listAgents(client({ success: true, data: { items: [{ id: 'x' }] } })),
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
