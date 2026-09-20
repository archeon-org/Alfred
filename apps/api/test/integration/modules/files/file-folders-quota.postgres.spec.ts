import { randomUUID } from 'node:crypto';

import { fileFolderListEnvelopeSchema } from '@alfred/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pdfWithText } from '../../../support/file-fixtures';
import { FilesPostgresFixture } from './files-postgres.fixture';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite.sequential('library folders and quota PostgreSQL', () => {
  const fixture = new FilesPostgresFixture();
  const size = pdfWithText('0000').byteLength;

  beforeAll(async () => {
    // Room for exactly two fixture documents, and a reservation that expires at once.
    await fixture.start(url!, { quotaBytes: size * 2 + 10, pendingTtlMs: 10_000 });
  });
  afterAll(async () => {
    await fixture.close();
  });

  const folder = async (token: string, name: string, parentId?: string) => {
    const result = await fixture.api('POST', '/files/folders', token, { name, parentId });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return result.body?.data as { id: string; depth: number; parentId: string | null };
  };

  it('organizes the library in folders that are metadata, not storage paths', async () => {
    const owner = await fixture.user();
    const contracts = await folder(owner.token, 'Contrats');
    const year = await folder(owner.token, '2026', contracts.id);
    expect([contracts.depth, year.depth, year.parentId]).toEqual([1, 2, contracts.id]);

    const file = await fixture.uploaded(owner.token, pdfWithText('1111'), 'bail.pdf', year.id);
    expect(file.folderId).toBe(year.id);

    const inFolder = await fixture.api('GET', `/files?folderId=${year.id}`, owner.token);
    expect(inFolder.body?.data?.items).toHaveLength(1);
    const atRoot = await fixture.api('GET', '/files?folderId=root', owner.token);
    expect(atRoot.body?.data?.items).toEqual([]);

    const tree = await fixture.api('GET', '/files/folders', owner.token);
    expect(
      fileFolderListEnvelopeSchema
        .parse(tree.body)
        .data.items.map((item) => [item.name, item.depth, item.fileCount]),
    ).toEqual([
      ['Contrats', 1, 0],
      ['2026', 2, 1],
    ]);

    // Renaming or moving a folder never touches a stored object: the key stays opaque.
    const [before] = await fixture.db.query<{ content_id: string }[]>(
      `SELECT r."content_id" FROM "api_artifact_revisions" r WHERE r."artifact_id" = $1`,
      [file.id],
    );
    await fixture.api('PATCH', `/files/folders/${year.id}`, owner.token, {
      name: 'Archives 2026',
      parentId: null,
    });
    const [after] = await fixture.db.query<{ content_id: string }[]>(
      `SELECT r."content_id" FROM "api_artifact_revisions" r WHERE r."artifact_id" = $1`,
      [file.id],
    );
    expect(after).toEqual(before);
    const download = await fixture.raw(`/files/${file.id}/content`, owner.token);
    expect(download.status).toBe(200);
  });

  it('refuses sibling name clashes, cycles, excessive depth and non-empty deletion', async () => {
    const owner = await fixture.user();
    const root = await folder(owner.token, 'Racine');

    const clash = await fixture.api('POST', '/files/folders', owner.token, { name: 'RACINE' });
    expect([clash.status, clash.body?.error?.code]).toEqual([409, 'folder_name_conflict']);

    let parent = root.id;
    for (let depth = 2; depth <= 8; depth += 1) {
      parent = (await folder(owner.token, `niveau-${depth}`, parent)).id;
    }
    const tooDeep = await fixture.api('POST', '/files/folders', owner.token, {
      name: 'niveau-9',
      parentId: parent,
    });
    expect([tooDeep.status, tooDeep.body?.error?.code]).toEqual([409, 'folder_depth_exceeded']);

    const cycle = await fixture.api('PATCH', `/files/folders/${root.id}`, owner.token, {
      parentId: parent,
    });
    expect([cycle.status, cycle.body?.error?.code]).toEqual([409, 'folder_cycle']);

    const notEmpty = await fixture.api('DELETE', `/files/folders/${root.id}`, owner.token);
    expect([notEmpty.status, notEmpty.body?.error?.code]).toEqual([409, 'folder_not_empty']);
    expect((await fixture.api('DELETE', `/files/folders/${parent}`, owner.token)).status).toBe(204);

    const stranger = await fixture.user();
    const foreign = await fixture.api('POST', '/files/folders', stranger.token, {
      name: 'intrus',
      parentId: root.id,
    });
    expect([foreign.status, foreign.body?.error?.code]).toEqual([404, 'folder_not_found']);
    const upload = await fixture.upload(stranger.token, pdfWithText('9999'), 'x.pdf', {
      folderId: root.id,
    });
    expect([upload.status, upload.body?.error?.code]).toEqual([404, 'folder_not_found']);
  });

  it('moves a subtree and keeps every depth right', async () => {
    const owner = await fixture.user();
    const a = await folder(owner.token, 'A');
    const b = await folder(owner.token, 'B', a.id);
    const c = await folder(owner.token, 'C', b.id);
    const target = await folder(owner.token, 'Cible');

    const moved = await fixture.api('PATCH', `/files/folders/${b.id}`, owner.token, {
      parentId: null,
    });
    expect(moved.body?.data).toMatchObject({ depth: 1, parentId: null });
    await fixture.api('PATCH', `/files/folders/${b.id}`, owner.token, { parentId: target.id });

    const depths = await fixture.db.query<{ name: string; depth: number }[]>(
      `SELECT "name", "depth" FROM "api_artifact_folders" WHERE "id" = ANY($1::uuid[]) ORDER BY "name"`,
      [[b.id, c.id]],
    );
    expect(depths).toEqual([
      { name: 'B', depth: 2 },
      { name: 'C', depth: 3 },
    ]);
  });

  it('admits uploads against one budget, even when they arrive together', async () => {
    const owner = await fixture.user();

    // One account sends two uploads at a time (a third is refused `upload_busy`), so the budget
    // is contested by pairs: one place is taken first, and two uploads then race for the other.
    expect((await fixture.upload(owner.token, pdfWithText('aaaa'), 'aaaa.pdf')).status).toBe(201);
    const results = await Promise.all(
      ['bbbb', 'cccc'].map((text) => fixture.upload(owner.token, pdfWithText(text), `${text}.pdf`)),
    );

    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const refused = results.find((result) => result.status === 409);
    expect(refused?.body?.error).toMatchObject({
      code: 'quota_exceeded',
      details: { limitBytes: size * 2 + 10 },
    });
    const quota = await fixture.api('GET', '/files/quota', owner.token);
    expect(quota.body?.data).toMatchObject({ usedBytes: size * 2, reservedBytes: 0 });

    // Deleting is what frees space, since nothing expires by itself.
    const [first] = (await fixture.api('GET', '/files', owner.token)).body?.data?.items ?? [];
    await fixture.api('DELETE', `/files/${String(first?.id)}`, owner.token);
    expect((await fixture.upload(owner.token, pdfWithText('eeee'), 'e.pdf')).status).toBe(201);
  });

  it('collects an upload that reserved quota and never completed', async () => {
    const owner = await fixture.user();
    const tenant = await fixture.db.query<{ tenant_id: string }[]>(
      `SELECT "tenant_id" FROM "api_users" WHERE "id" = $1`,
      [owner.id],
    );
    const abandoned = randomUUID();
    await fixture.db.query(
      `INSERT INTO "api_artifact_contents" ("id", "tenant_id", "owner_user_id", "role", "backend",
         "media_type", "size_bytes", "sha256", "state", "upload_id", "expires_at")
       VALUES ($1, $2, $3, 'original', 'local', 'application/pdf', $4, $5, 'pending', $6, now() - interval '1 second')`,
      [abandoned, tenant[0]?.tenant_id, owner.id, size * 2, 'a'.repeat(64), randomUUID()],
    );

    // An expired reservation no longer counts, before it is even collected.
    const quota = await fixture.api('GET', '/files/quota', owner.token);
    expect(quota.body?.data).toMatchObject({ usedBytes: 0, reservedBytes: 0 });

    // The row outlives its reservation by a grace period, in case a write is still landing.
    await fixture.collect();
    const ended = await fixture.db.query<{ state: string }[]>(
      `SELECT "state" FROM "api_artifact_contents" WHERE "id" = $1`,
      [abandoned],
    );
    expect(ended).toEqual([{ state: 'failed' }]);

    await fixture.collectAbandoned();
    const left = await fixture.db.query<unknown[]>(
      `SELECT 1 FROM "api_artifact_contents" WHERE "id" = $1`,
      [abandoned],
    );
    expect(left).toEqual([]);
  });
});
