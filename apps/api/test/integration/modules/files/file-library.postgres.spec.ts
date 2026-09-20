import { randomUUID } from 'node:crypto';

import {
  fileEnvelopeSchema,
  fileListEnvelopeSchema,
  fileQuotaEnvelopeSchema,
} from '@alfred/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { docxWithText, pdfWithoutText, pdfWithText } from '../../../support/file-fixtures';
import { FilesPostgresFixture } from './files-postgres.fixture';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite.sequential('personal file library PostgreSQL', () => {
  const fixture = new FilesPostgresFixture();

  beforeAll(async () => {
    await fixture.start(url!);
  });
  afterAll(async () => {
    await fixture.close();
  });

  it('stores an upload, extracts its text off the request path and serves it back', async () => {
    const owner = await fixture.user();
    const bytes = pdfWithText('Clause de resiliation');

    const file = await fixture.uploaded(owner.token, bytes, 'Contrat cadre.pdf');
    expect(file).toMatchObject({
      name: 'Contrat cadre.pdf',
      kind: 'pdf',
      mediaType: 'application/pdf',
      sizeBytes: bytes.byteLength,
      readiness: 'processing',
      folderId: null,
      usage: { conversations: 0, messages: 0 },
    });
    // Storage details never reach the browser.
    expect(JSON.stringify(file)).not.toMatch(/sha256|contentId|content_id|backend|contents\//u);

    await fixture.extractAll();
    const read = await fixture.api('GET', `/files/${file.id}`, owner.token);
    expect(fileEnvelopeSchema.parse(read.body).data).toMatchObject({
      readiness: 'ready',
      pageCount: 1,
      failureCode: null,
    });

    const download = await fixture.raw(`/files/${file.id}/content`, owner.token);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('application/pdf');
    expect(download.headers.get('content-disposition')).toContain('attachment;');
    expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
  });

  it('reports a document it cannot read instead of leaving it processing', async () => {
    const owner = await fixture.user();
    const file = await fixture.uploaded(owner.token, pdfWithoutText(), 'scan.pdf');

    await fixture.extractAll();

    const read = await fixture.api('GET', `/files/${file.id}`, owner.token);
    expect(read.body?.data).toMatchObject({ readiness: 'failed', failureCode: 'no_readable_text' });
  });

  it('decides the type from the bytes and refuses what is not accepted', async () => {
    const owner = await fixture.user();

    const disguised = await fixture.upload(owner.token, Buffer.from('<html></html>'), 'x.pdf');
    expect([disguised.status, disguised.body?.error?.code]).toEqual([
      415,
      'unsupported_media_type',
    ]);

    const macro = await fixture.upload(
      owner.token,
      docxWithText('x', [{ name: 'word/vbaProject.bin', content: 'macro' }]),
      'macro.docx',
    );
    expect([macro.status, macro.body?.error?.code]).toEqual([422, 'file_rejected']);

    // The extension follows the detected type, whatever the upload was called.
    const renamed = await fixture.uploaded(owner.token, pdfWithText('a'), 'rapport.docx');
    expect(renamed.name).toBe('rapport.pdf');
  });

  it('keeps one entry and one quota charge for the same bytes', async () => {
    const owner = await fixture.user();
    const bytes = pdfWithText('identique');
    const first = await fixture.uploaded(owner.token, bytes, 'a.pdf');

    const again = await fixture.upload(owner.token, bytes, 'autre-nom.pdf');

    expect(again.status).toBe(201);
    expect(again.body?.data).toMatchObject({ deduplicated: true, file: { id: first.id } });
    const quota = await fixture.api('GET', '/files/quota', owner.token);
    expect(fileQuotaEnvelopeSchema.parse(quota.body).data).toMatchObject({
      usedBytes: bytes.byteLength,
      reservedBytes: 0,
    });
    // One stored object for this owner: the second upload wrote nothing.
    const stored = await fixture.db.query<{ id: string }[]>(
      `SELECT "id" FROM "api_artifact_contents" WHERE "owner_user_id" = $1 AND "state" = 'ready'`,
      [owner.id],
    );
    expect(stored).toHaveLength(1);
    expect(await fixture.stored(String(stored[0]?.id))).toBe(true);
  });

  it('answers a retried upload with the first result, and refuses a reused identity', async () => {
    const owner = await fixture.user();
    const uploadId = randomUUID();
    const bytes = pdfWithText('une fois');

    const first = await fixture.upload(owner.token, bytes, 'retry.pdf', { uploadId });
    const retried = await fixture.upload(owner.token, bytes, 'retry.pdf', { uploadId });
    const reused = await fixture.upload(owner.token, pdfWithText('autre'), 'x.pdf', { uploadId });

    expect(retried.status).toBe(201);
    expect(retried.body?.data).toMatchObject({
      deduplicated: false,
      file: { id: (first.body?.data as { file: { id: string } }).file.id },
    });
    expect([reused.status, reused.body?.error?.code]).toEqual([409, 'file_upload_conflict']);
  });

  it('keeps repeated names distinct and refuses a rename onto a taken name', async () => {
    const owner = await fixture.user();
    const first = await fixture.uploaded(owner.token, pdfWithText('un'), 'scan.pdf');
    const second = await fixture.uploaded(owner.token, pdfWithText('deux'), 'SCAN.pdf');
    expect(second.name).toBe('SCAN (2).pdf');

    const conflict = await fixture.api('PATCH', `/files/${second.id}`, owner.token, {
      name: 'Scan',
    });
    expect([conflict.status, conflict.body?.error?.code]).toEqual([409, 'file_name_conflict']);

    const renamed = await fixture.api('PATCH', `/files/${first.id}`, owner.token, {
      name: 'Pièce jointe',
      tags: ['juridique', 'juridique', ' 2026 '],
      description: '  Version signée  ',
    });
    expect(renamed.body?.data).toMatchObject({
      name: 'Pièce jointe.pdf',
      tags: ['juridique', '2026'],
      description: 'Version signée',
    });
  });

  it('lists the whole library newest first, with search and filters', async () => {
    const owner = await fixture.user();
    const pdf = await fixture.uploaded(owner.token, pdfWithText('alpha'), 'Bilan 2025.pdf');
    const docx = await fixture.uploaded(owner.token, docxWithText('beta'), 'Note interne.docx');
    await fixture.extractAll();
    await fixture.api('PATCH', `/files/${pdf.id}`, owner.token, { tags: ['finance'] });

    const names = async (query: string): Promise<string[]> => {
      const result = await fixture.api('GET', `/files${query}`, owner.token);
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      return fileListEnvelopeSchema.parse(result.body).data.items.map((item) => item.name);
    };

    expect(await names('')).toEqual(['Note interne.docx', 'Bilan 2025.pdf']);
    expect(await names('?search=bilan')).toEqual(['Bilan 2025.pdf']);
    expect(await names('?search=100%25')).toEqual([]);
    expect(await names('?kind=docx')).toEqual(['Note interne.docx']);
    expect(await names('?tag=finance')).toEqual(['Bilan 2025.pdf']);
    expect(await names('?readiness=processing')).toEqual([]);
    expect(await names('?folderId=root')).toHaveLength(2);

    const page = await fixture.api('GET', '/files?limit=1', owner.token);
    const { items, nextCursor } = fileListEnvelopeSchema.parse(page.body).data;
    expect(items.map((item) => item.id)).toEqual([docx.id]);
    const next = await fixture.api(
      'GET',
      `/files?limit=1&cursor=${encodeURIComponent(nextCursor ?? '')}`,
      owner.token,
    );
    expect(fileListEnvelopeSchema.parse(next.body).data.items.map((item) => item.id)).toEqual([
      pdf.id,
    ]);
  });

  it('never shows or serves one user file to another', async () => {
    const owner = await fixture.user();
    const stranger = await fixture.user();
    const file = await fixture.uploaded(owner.token, pdfWithText('privé'), 'secret.pdf');

    for (const [method, path, body] of [
      ['GET', `/files/${file.id}`, undefined],
      ['PATCH', `/files/${file.id}`, { name: 'volé' }],
      ['DELETE', `/files/${file.id}`, undefined],
    ] as const) {
      const result = await fixture.api(method, path, stranger.token, body);
      expect([result.status, result.body?.error?.code], `${method} ${path}`).toEqual([
        404,
        'file_not_found',
      ]);
    }
    expect((await fixture.raw(`/files/${file.id}/content`, stranger.token)).status).toBe(404);
    const listed = await fixture.api('GET', '/files', stranger.token);
    expect(listed.body?.data?.items).toEqual([]);
    expect((await fixture.raw(`/files/${file.id}`, 'not-a-token')).status).toBe(401);
  });

  it('deletes on request: the entry goes, the quota is free, the bytes are collected', async () => {
    const owner = await fixture.user();
    const bytes = pdfWithText('à supprimer');
    const file = await fixture.uploaded(owner.token, bytes, 'ephemere.pdf');
    await fixture.extractAll();
    const [revision] = await fixture.db.query<{ content_id: string }[]>(
      `SELECT "content_id" FROM "api_artifact_revisions" WHERE "artifact_id" = $1`,
      [file.id],
    );
    const contentId = String(revision?.content_id);
    expect(await fixture.stored(contentId)).toBe(true);

    const removed = await fixture.api('DELETE', `/files/${file.id}`, owner.token);
    expect(removed.status).toBe(204);

    expect((await fixture.api('GET', `/files/${file.id}`, owner.token)).status).toBe(404);
    const quota = await fixture.api('GET', '/files/quota', owner.token);
    expect(quota.body?.data).toMatchObject({ usedBytes: 0 });

    await fixture.collect();
    expect(await fixture.stored(contentId)).toBe(false);
    const [content] = await fixture.db.query<{ state: string; text: string | null }[]>(
      `SELECT c."state", e."text" FROM "api_artifact_revisions" r
       JOIN "api_artifact_contents" c ON c."id" = r."content_id"
       JOIN "api_artifact_extractions" e ON e."content_id" = c."id" WHERE r."artifact_id" = $1`,
      [file.id],
    );
    expect(content).toEqual({ state: 'purged', text: null });

    // The same bytes may come back: the deleted entry no longer counts as a duplicate.
    const back = await fixture.upload(owner.token, bytes, 'ephemere.pdf');
    expect(back.body?.data).toMatchObject({ deduplicated: false });
  });
});
