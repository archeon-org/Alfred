import { describe, expect, it, vi } from 'vitest';

import type { AuthPrincipal } from '@api/common/auth/auth-principal';
import type { FileExtractionWorker } from '@api/modules/files/application/file-extraction.worker';
import type { FileSettings } from '@api/modules/files/application/file-settings';
import { FileUploadService } from '@api/modules/files/application/file-upload.service';
import { sha256Of } from '@api/modules/files/domain/content-digest';
import type { ArtifactContentStore } from '@api/modules/files/domain/content-store.port';
import { ArtifactContentEntity } from '@api/modules/files/infrastructure/persistence/artifact-content.entity';
import { ArtifactFolderEntity } from '@api/modules/files/infrastructure/persistence/artifact-folder.entity';
import { ArtifactRevisionEntity } from '@api/modules/files/infrastructure/persistence/artifact-revision.entity';
import { ArtifactEntity } from '@api/modules/files/infrastructure/persistence/artifact.entity';
import type { TenantsService } from '@api/modules/tenants/tenants.service';
import { FakeDb } from '../../../../support/fake-db';
import { docxWithText, pdfWithText } from '../../../../support/file-fixtures';

const principal = { id: 'owner' } as AuthPrincipal;
const scope = { tenantId: 'tenant', ownerUserId: 'owner' };
const bytes = pdfWithText('Bonjour');
const uploadId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-09-18T10:00:00Z');

const stored = (overrides: Partial<ArtifactEntity> = {}) =>
  ({
    id: 'artifact',
    ...scope,
    folderId: null,
    name: 'a.pdf',
    nameKey: 'a.pdf',
    kind: 'pdf',
    mediaType: 'application/pdf',
    sizeBytes: bytes.byteLength,
    sha256: sha256Of(bytes),
    currentRevisionId: 'revision',
    readiness: 'ready',
    failureCode: null,
    pageCount: 1,
    description: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  }) as ArtifactEntity;

function fixture(options: { settings?: Partial<FileSettings>; used?: number } = {}) {
  const db = new FakeDb()
    .when(/FROM "api_artifact_contents"[\s\S]*"role" = 'original'/u, [
      { used: String(options.used ?? 0), reserved: '0' },
    ])
    // What a request finds when it looks its content up after a publication that did not keep it.
    .when(/SELECT "state" FROM "api_artifact_contents" WHERE "id" = \$1/u, [{ state: 'pending' }]);
  const store = {
    put: vi.fn().mockResolvedValue({ byteSize: bytes.byteLength, sha256: sha256Of(bytes) }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const extraction = { nudge: vi.fn() };
  const settings = {
    maxFileBytes: 5_000_000,
    quotaBytesPerUser: 10_000_000,
    pendingUploadTtlMs: 60_000,
    maxConcurrentUploads: 2,
    ...options.settings,
  } as FileSettings;
  db.repository(ArtifactContentEntity).save.mockResolvedValue({ id: 'content' });
  db.repository(ArtifactEntity).save.mockImplementation((value: unknown) =>
    Promise.resolve({ ...(value as object), id: 'artifact', createdAt: now, updatedAt: now }),
  );
  db.repository(ArtifactRevisionEntity).save.mockResolvedValue({ id: 'revision' });
  const service = new FileUploadService(
    db.asDataSource(),
    { scopeFor: vi.fn().mockResolvedValue(scope) } as unknown as TenantsService,
    extraction as unknown as FileExtractionWorker,
    store as unknown as ArtifactContentStore,
    settings,
    { driver: 'local', root: '/srv/uploads' },
  );
  const upload = (input: Partial<Parameters<FileUploadService['upload']>[1]> = {}) =>
    service.upload(principal, {
      bytes,
      declaredName: 'Rapport.PDF',
      uploadId,
      folderId: null,
      ...input,
    });
  return { db, store, extraction, service, upload };
}

describe('FileUploadService', () => {
  it('reserves quota, stores the bytes, then publishes the library entry', async () => {
    const { db, store, extraction, upload } = fixture();

    const result = await upload();

    expect(result).toMatchObject({
      deduplicated: false,
      file: { id: 'artifact', name: 'Rapport.pdf', kind: 'pdf', readiness: 'processing' },
    });
    // The reservation exists before the bytes are written, and only then becomes `ready`.
    const order = [
      db.repository(ArtifactContentEntity).save.mock.invocationCallOrder[0],
      store.put.mock.invocationCallOrder[0],
      db.repository(ArtifactContentEntity).update.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => Number(a) - Number(b)));
    expect(db.repository(ArtifactContentEntity).save.mock.calls[0]?.[0]).toMatchObject({
      state: 'pending',
      role: 'original',
      backend: 'local',
      uploadId,
      sizeBytes: bytes.byteLength,
      sha256: sha256Of(bytes),
    });
    expect(store.put).toHaveBeenCalledWith('content', bytes, {
      mediaType: 'application/pdf',
      signal: undefined,
    });
    // Only a reservation that still counts against the quota is published.
    expect(db.repository(ArtifactContentEntity).update).toHaveBeenCalledWith(
      { id: 'content', state: 'pending', expiresAt: expect.anything() as unknown },
      { state: 'ready', expiresAt: null },
    );
    expect(extraction.nudge).toHaveBeenCalledOnce();
  });

  it.each([
    ['an empty file', Buffer.alloc(0), 422, 'file_rejected'],
    ['a file above the limit', Buffer.alloc(11), 413, 'file_too_large'],
    ['an unknown type', Buffer.from('plain text'), 415, 'unsupported_media_type'],
  ])('refuses %s before touching the database', async (_label, content, status, code) => {
    const { db, store, upload } = fixture({ settings: { maxFileBytes: 10 } });

    await expect(upload({ bytes: content })).rejects.toMatchObject({ code });
    await expect(upload({ bytes: content })).rejects.toHaveProperty('status', status);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  it('refuses a macro-enabled document', async () => {
    const macro = docxWithText('x', [{ name: 'word/vbaProject.bin', content: 'm' }]);

    await expect(fixture().upload({ bytes: macro })).rejects.toMatchObject({
      code: 'file_rejected',
    });
  });

  it('refuses an upload that would exceed the owner budget, with the figures', async () => {
    const { store, upload } = fixture({
      used: 9_999_900,
      settings: { quotaBytesPerUser: 10_000_000 },
    });

    await expect(upload()).rejects.toMatchObject({
      code: 'quota_exceeded',
      details: { usedBytes: 9_999_900, reservedBytes: 0, limitBytes: 10_000_000 },
    });
    expect(store.put).not.toHaveBeenCalled();
  });

  it('answers the existing entry when the same bytes are already in the library', async () => {
    const { db, store, upload } = fixture();
    db.repository(ArtifactEntity).findOne.mockResolvedValue(stored());

    await expect(upload()).resolves.toMatchObject({ deduplicated: true, file: { id: 'artifact' } });
    expect(store.put).not.toHaveBeenCalled();
    expect(db.repository(ArtifactContentEntity).save).not.toHaveBeenCalled();
  });

  it('answers a retried upload with its first result', async () => {
    const { db, store, upload } = fixture();
    db.repository(ArtifactContentEntity).findOne.mockResolvedValue({
      id: 'content',
      sha256: sha256Of(bytes),
      state: 'ready',
    });
    db.repository(ArtifactRevisionEntity).findOne.mockResolvedValue({ artifactId: 'artifact' });
    db.repository(ArtifactEntity).findOne.mockResolvedValue(stored());

    await expect(upload()).resolves.toMatchObject({
      deduplicated: false,
      file: { id: 'artifact' },
    });
    expect(store.put).not.toHaveBeenCalled();
  });

  it('refuses an upload identity reused for other bytes, or spent on a deleted file', async () => {
    const other = fixture();
    other.db
      .repository(ArtifactContentEntity)
      .findOne.mockResolvedValue({ id: 'content', sha256: 'f'.repeat(64), state: 'ready' });
    await expect(other.upload()).rejects.toMatchObject({ code: 'file_upload_conflict' });

    const spent = fixture();
    spent.db
      .repository(ArtifactContentEntity)
      .findOne.mockResolvedValue({ id: 'content', sha256: sha256Of(bytes), state: 'purged' });
    await expect(spent.upload()).rejects.toMatchObject({ code: 'file_upload_conflict' });
  });

  it('finishes an attempt that stopped between its two transactions', async () => {
    const { db, store, upload } = fixture();
    db.repository(ArtifactContentEntity).findOne.mockResolvedValue({
      id: 'content',
      sha256: sha256Of(bytes),
      state: 'failed',
    });

    await expect(upload()).resolves.toMatchObject({ deduplicated: false });
    expect(store.put).toHaveBeenCalledWith('content', bytes, expect.anything());
    // No second reservation row: the first identity is resumed.
    expect(db.repository(ArtifactContentEntity).save).not.toHaveBeenCalled();
  });

  it('refuses an unknown folder, and lands at the top level if the folder vanished meanwhile', async () => {
    const missing = fixture();
    missing.db.repository(ArtifactFolderEntity).existsBy.mockResolvedValue(false);
    await expect(missing.upload({ folderId: 'folder' })).rejects.toMatchObject({
      code: 'folder_not_found',
    });

    const vanished = fixture();
    vanished.db
      .repository(ArtifactFolderEntity)
      .existsBy.mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(vanished.upload({ folderId: 'folder' })).resolves.toMatchObject({
      file: { folderId: null },
    });
  });

  it('marks the reservation failed and answers 503 when the store refuses the bytes', async () => {
    const { db, store, extraction, upload } = fixture();
    store.put.mockRejectedValue(new Error('provider down'));

    await expect(upload()).rejects.toMatchObject({ code: 'storage_unavailable', status: 503 });
    // Fenced by the deadline this request wrote: a twin that took the reservation over is spared.
    const reserved = db.repository(ArtifactContentEntity).save.mock.calls[0]?.[0] as {
      expiresAt: Date;
    };
    expect(db.parametersOf(/SET "state" = 'failed'/u)).toEqual(['content', reserved.expiresAt]);
    expect(extraction.nudge).not.toHaveBeenCalled();
  });

  it('hands its bytes to the collector when the same file was published meanwhile', async () => {
    const { db, upload } = fixture();
    db.repository(ArtifactEntity)
      .findOne.mockResolvedValueOnce(null)
      .mockResolvedValue(stored({ id: 'winner' }));

    await expect(upload()).resolves.toMatchObject({ deduplicated: true, file: { id: 'winner' } });
    // Only an unreferenced copy may ever be purged: the statement carries the guard itself.
    const purge = db.statements.find(({ sql }) => /SET "state" = 'purging'/u.test(sql));
    expect(purge?.parameters).toEqual(['content']);
    expect(purge?.sql).toMatch(/NOT EXISTS \(SELECT 1 FROM "api_artifact_revisions"/u);
  });

  it('answers the twin of a request that shares its upload identity, and purges nothing', async () => {
    const { db, extraction, upload } = fixture();
    // Both requests were admitted on one content; the twin published it while this one wrote.
    db.repository(ArtifactContentEntity).findOne.mockResolvedValue({
      id: 'content',
      sha256: sha256Of(bytes),
      state: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
    });
    db.repository(ArtifactRevisionEntity)
      .findOne.mockResolvedValueOnce(null)
      .mockResolvedValue({ artifactId: 'artifact' });
    db.repository(ArtifactEntity).findOne.mockResolvedValue(stored());

    await expect(upload()).resolves.toMatchObject({
      deduplicated: false,
      file: { id: 'artifact' },
    });
    expect(db.ran(/SET "state" = 'purging'/u)).toBe(false);
    expect(db.repository(ArtifactEntity).save).not.toHaveBeenCalled();
    expect(extraction.nudge).toHaveBeenCalledOnce();
  });

  it('publishes nothing for an upload its browser gave up', async () => {
    const during = fixture();
    const cancelledDuringWrite = new AbortController();
    during.store.put.mockImplementation(() => {
      cancelledDuringWrite.abort();
      return Promise.reject(new Error('aborted'));
    });
    await expect(
      during.service.upload(
        principal,
        { bytes, declaredName: 'a.pdf', uploadId, folderId: null },
        cancelledDuringWrite.signal,
      ),
    ).rejects.toMatchObject({ code: 'upload_cancelled' });
    expect(during.db.repository(ArtifactEntity).save).not.toHaveBeenCalled();

    const after = fixture();
    const cancelledAfterWrite = new AbortController();
    after.store.put.mockImplementation(() => {
      cancelledAfterWrite.abort();
      return Promise.resolve({ byteSize: 1, sha256: 'a' });
    });
    await expect(
      after.service.upload(
        principal,
        { bytes, declaredName: 'a.pdf', uploadId, folderId: null },
        cancelledAfterWrite.signal,
      ),
    ).rejects.toMatchObject({ code: 'upload_cancelled' });
    expect(after.db.repository(ArtifactEntity).save).not.toHaveBeenCalled();
    // The reservation is released, but only while pending and unreferenced.
    const release = after.db.statements.find(({ sql }) => /SET "state" = 'failed'/u.test(sql));
    expect(release?.sql).toMatch(/"state" = 'pending'/u);
    expect(release?.sql).toMatch(/NOT EXISTS/u);
  });

  it('asks for a new attempt when the reservation expired during the write', async () => {
    const { db, store, upload } = fixture();
    db.repository(ArtifactContentEntity).update.mockResolvedValue({ affected: 0 });

    await expect(upload()).rejects.toMatchObject({ code: 'file_upload_conflict', status: 409 });
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('leaves a durable record of bytes whose reservation is gone, for the collector to purge', async () => {
    const { db, store, upload } = fixture();
    db.repository(ArtifactContentEntity).update.mockResolvedValue({ affected: 0 });

    await expect(upload()).rejects.toMatchObject({ code: 'file_upload_conflict' });

    // One statement covers a row that is gone (inserted as `purging`) and a late write under a
    // purged content (flipped back); nothing is deleted here, where a failure would be final.
    const tombstone = db.statements.find(({ sql }) =>
      /INSERT INTO "api_artifact_contents"[\s\S]*'purging'\)/u.test(sql),
    );
    expect(tombstone?.sql).toMatch(/ON CONFLICT \("id"\) DO UPDATE SET "state" = 'purging'/u);
    expect(tombstone?.sql).toMatch(/WHERE "api_artifact_contents"\."state" = 'purged'/u);
    expect(tombstone?.parameters).toEqual([
      'content',
      scope.tenantId,
      scope.ownerUserId,
      'original',
      'local',
      'application/pdf',
      bytes.byteLength,
      sha256Of(bytes),
    ]);
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('deletes the bytes itself only when the database refuses the record, and never throws', async () => {
    const { db, store, upload } = fixture();
    db.repository(ArtifactContentEntity).update.mockResolvedValue({ affected: 0 });
    const query = db.query.getMockImplementation() as (
      sql: string,
      parameters?: readonly unknown[],
    ) => Promise<unknown[]>;
    db.query.mockImplementation((sql: string, parameters?: readonly unknown[]) =>
      /INSERT INTO "api_artifact_contents"[\s\S]*'purging'\)/u.test(sql)
        ? Promise.reject(new Error('database outage'))
        : query(sql, parameters),
    );
    store.delete.mockRejectedValueOnce(new Error('provider down'));

    // Both failing is logged with the identity; the request still answers its own error.
    await expect(upload()).rejects.toMatchObject({ code: 'file_upload_conflict' });
    expect(store.delete).toHaveBeenCalledWith('content');
  });

  it('reads a replayed identity under lock, since the collector may be removing it', async () => {
    const { db, upload } = fixture();

    await upload();

    expect(db.repository(ArtifactContentEntity).findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('admits a replayed reservation again once it stopped counting against the quota', async () => {
    const full = fixture({ used: 10_000_000 });
    full.db.repository(ArtifactContentEntity).findOne.mockResolvedValue({
      id: 'content',
      sha256: sha256Of(bytes),
      state: 'failed',
      expiresAt: null,
    });
    await expect(full.upload()).rejects.toMatchObject({ code: 'quota_exceeded' });
    expect(full.store.put).not.toHaveBeenCalled();

    // A reservation still running already counts: replaying it reserves nothing more.
    const reserved = fixture({ used: 10_000_000 });
    reserved.db.repository(ArtifactContentEntity).findOne.mockResolvedValue({
      id: 'content',
      sha256: sha256Of(bytes),
      state: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(reserved.upload()).resolves.toMatchObject({ deduplicated: false });
  });

  it('answers a replay with the file its first attempt was deduplicated to', async () => {
    const { db, store, upload } = fixture();
    db.repository(ArtifactContentEntity).findOne.mockResolvedValue({
      id: 'content',
      sha256: sha256Of(bytes),
      state: 'purging',
      expiresAt: null,
    });
    db.repository(ArtifactEntity).findOne.mockResolvedValue(stored({ id: 'winner' }));

    await expect(upload()).resolves.toMatchObject({ deduplicated: true, file: { id: 'winner' } });
    expect(store.put).not.toHaveBeenCalled();
  });

  it('keeps a repeated name distinct in its folder', async () => {
    const { db, upload } = fixture();
    db.when(/SELECT "name_key" FROM "api_artifacts"/u, [
      { name_key: 'rapport.pdf' },
      { name_key: 'rapport (2).pdf' },
    ]);

    await expect(upload()).resolves.toMatchObject({ file: { name: 'Rapport (3).pdf' } });
  });
});
