import { describe, expect, it, vi } from 'vitest';
import {
  listSkillVersions,
  restoreSkill,
  setSkillAvailability,
  deleteSkill,
  getSkill,
  listSkills,
  publishSkill,
  saveSkill,
} from '@/services/skills/skills.service';
import { skillFixture } from '../../support/skills-api';

const client = (data: unknown, status = 200) => ({
  request: vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response(status === 204 ? null : JSON.stringify(data), { status })),
    ),
});
describe('Skills HTTP boundary', () => {
  it('validates list and URL encodes search and cursors', async () => {
    const http = client({ success: true, data: { items: [skillFixture()], nextCursor: null } });
    expect((await listSkills(http, 'next', 'résumé')).items).toHaveLength(1);
    expect(http.request).toHaveBeenCalledWith(
      '/skills?cursor=next&limit=50&search=r%C3%A9sum%C3%A9',
      expect.anything(),
    );
  });
  it('fails closed on malformed detail data', async () => {
    await expect(getSkill(client({ success: true, data: { id: 'fake' } }), 'id')).rejects.toThrow(
      'invalide',
    );
  });
  it('creates without replaying unsafe mutations', async () => {
    const item = skillFixture();
    const http = client({ success: true, data: item });
    const input = { name: item.name, description: item.description, files: item.files };
    await saveSkill(http, input);
    expect(http.request).toHaveBeenCalledWith(
      '/skills',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    );
    expect(http.request.mock.calls[0]?.[1]).not.toHaveProperty('retryOnUnauthorized', true);
  });
  it('updates with expectedVersion and publishes using returned revision', async () => {
    const item = skillFixture({ version: 2 });
    const http = client({ success: true, data: item });
    const input = { name: item.name, description: item.description, files: item.files };
    const updated = await saveSkill(http, input, { id: item.id, version: 1 });
    expect(http.request).toHaveBeenLastCalledWith(
      `/skills/${item.id}`,
      expect.objectContaining({
        body: JSON.stringify({ ...input, expectedVersion: 1 }),
        method: 'PUT',
      }),
    );
    await publishSkill(http, item.id, updated.version);
    expect(http.request).toHaveBeenLastCalledWith(
      `/skills/${item.id}/publish`,
      expect.objectContaining({ body: JSON.stringify({ expectedVersion: 2 }) }),
    );
  });
  it('propagates stable conflict error codes', async () => {
    await expect(
      deleteSkill(
        client(
          { success: false, error: { code: 'skill_version_conflict', message: 'Conflict' } },
          409,
        ),
        'id',
        1,
      ),
    ).rejects.toMatchObject({ code: 'skill_version_conflict', status: 409 });
  });
  it('accepts delete 204 and rejects malformed lists', async () => {
    await deleteSkill(client(null, 204), 'id', 1);
    await expect(listSkills(client({ data: [] }))).rejects.toThrow('invalide');
  });
  it('paginates version history and validates its envelope', async () => {
    const http = client({
      success: true,
      data: {
        items: [
          {
            version: 2,
            name: 'synthese',
            description: 'Résumer',
            totalBytes: 10,
            createdAt: '2026-09-10T10:00:00.000Z',
            publishedAt: null,
          },
        ],
        nextBefore: 2,
      },
    });
    expect((await listSkillVersions(http, 'id', 3)).nextBefore).toBe(2);
    expect(http.request).toHaveBeenCalledWith(
      '/skills/id/versions?before=3&limit=20',
      expect.objectContaining({ method: 'GET' }),
    );
    await expect(
      listSkillVersions(client({ success: true, data: { items: [], nextBefore: 'bad' } }), 'id'),
    ).rejects.toThrow('invalide');
  });
  it('sends independent CAS tokens for restore and availability without unsafe retries', async () => {
    const http = client({ success: true, data: skillFixture() });
    await restoreSkill(http, 'id', 7, 2);
    expect(http.request).toHaveBeenLastCalledWith(
      '/skills/id/restore',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 7, sourceVersion: 2 }),
      }),
    );
    await setSkillAvailability(http, 'id', 8, false);
    expect(http.request).toHaveBeenLastCalledWith(
      '/skills/id/availability',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ expectedVersion: 8, enabled: false }),
      }),
    );
    for (const call of http.request.mock.calls)
      expect(call[1]).not.toHaveProperty('retryOnUnauthorized', true);
  });
  it.each(['history', 'restore', 'availability'])(
    'propagates server rejection for %s',
    async (operation) => {
      const http = client(
        { success: false, error: { code: 'skill_version_conflict', message: 'Conflict' } },
        409,
      );
      const promise =
        operation === 'history'
          ? listSkillVersions(http, 'id')
          : operation === 'restore'
            ? restoreSkill(http, 'id', 3, 1)
            : setSkillAvailability(http, 'id', 3, false);
      await expect(promise).rejects.toMatchObject({ status: 409, code: 'skill_version_conflict' });
    },
  );
});
