import { describe, expect, it, vi } from 'vitest';
import { getContextDocuments, saveContextDocument } from '@/services/context/context.service';

const document = {
  kind: 'instructions',
  content: '',
  revision: 0,
  contentHash: '0'.repeat(64),
  updatedAt: null,
};
const clientFor = (body: unknown, status = 200) => ({
  request: vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
});

describe('Context API boundary', () => {
  it('fails closed on malformed envelopes, duplicate kinds and wrong scope kinds', async () => {
    for (const body of [
      { success: true, data: { maxBytes: 65536, documents: [{ ...document, revision: '0' }] } },
      { success: true, data: { maxBytes: 65536, documents: [document, document] } },
      {
        success: true,
        data: { maxBytes: 65536, documents: [document, { ...document, kind: 'preferences' }] },
      },
    ]) {
      await expect(
        getContextDocuments(clientFor(body), { type: 'project', projectId: 'project' }),
      ).rejects.toThrow();
    }
  });
  it('preserves stable error codes and rejects a save response for another kind', async () => {
    await expect(
      getContextDocuments(
        clientFor(
          { success: false, error: { code: 'project_not_found', message: 'private' } },
          404,
        ),
        { type: 'project', projectId: 'other' },
      ),
    ).rejects.toMatchObject({ code: 'project_not_found' });
    await expect(
      saveContextDocument(
        clientFor({ success: true, data: { ...document, kind: 'context' } }),
        { type: 'personal' },
        'instructions',
        { content: 'Texte', expectedRevision: 0 },
      ),
    ).rejects.toThrow('correspond');
    await expect(
      saveContextDocument(
        clientFor(
          { success: false, error: { code: 'context_revision_conflict', message: 'Conflict' } },
          409,
        ),
        { type: 'personal' },
        'instructions',
        { content: 'Texte', expectedRevision: 0 },
      ),
    ).rejects.toMatchObject({ code: 'context_revision_conflict' });
  });
});
