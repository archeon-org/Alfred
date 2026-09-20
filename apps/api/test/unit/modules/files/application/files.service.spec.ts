import { describe, expect, it, vi } from 'vitest';

import type { AuthPrincipal } from '@api/common/auth/auth-principal';
import type { FileCollector } from '@api/modules/files/application/file-collector';
import type { FileSettings } from '@api/modules/files/application/file-settings';
import { FilesService } from '@api/modules/files/application/files.service';
import type { ArtifactContentStore } from '@api/modules/files/domain/content-store.port';
import { ArtifactFolderEntity } from '@api/modules/files/infrastructure/persistence/artifact-folder.entity';
import { ArtifactEntity } from '@api/modules/files/infrastructure/persistence/artifact.entity';
import type { TenantsService } from '@api/modules/tenants/tenants.service';
import { FakeDb } from '../../../../support/fake-db';

const paginated = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('@api/common/pagination/paginate', () => ({
  // A plain function: the suite resets every `vi.fn` between cases.
  paginateByCursor: (...parameters: unknown[]) => {
    paginated.calls.push(parameters);
    return Promise.resolve({ items: [], nextCursor: null });
  },
}));

const principal = { id: 'owner' } as AuthPrincipal;
const scope = { tenantId: 'tenant', ownerUserId: 'owner' };
const now = new Date('2026-09-18T10:00:00Z');
const artifact = (overrides: Partial<ArtifactEntity> = {}) =>
  ({
    id: 'artifact',
    ...scope,
    folderId: null,
    name: 'Contrat.pdf',
    nameKey: 'contrat.pdf',
    kind: 'pdf',
    mediaType: 'application/pdf',
    sizeBytes: 10,
    sha256: 'a'.repeat(64),
    currentRevisionId: 'revision',
    readiness: 'ready',
    failureCode: null,
    pageCount: 2,
    description: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  }) as ArtifactEntity;

function fixture(found: ArtifactEntity | null = artifact()) {
  const db = new FakeDb();
  db.repository(ArtifactEntity).findOne.mockResolvedValue(found);
  const store = { get: vi.fn().mockResolvedValue(Buffer.from('bytes')) };
  const collector = { nudge: vi.fn() };
  const service = new FilesService(
    db.asDataSource(),
    { scopeFor: vi.fn().mockResolvedValue(scope) } as unknown as TenantsService,
    collector as unknown as FileCollector,
    store as unknown as ArtifactContentStore,
    { quotaBytesPerUser: 100, maxFileBytes: 50 } as FileSettings,
  );
  return { db, store, collector, service };
}

describe('FilesService', () => {
  it('always reads a file inside its owner scope, and never a deleted one', async () => {
    const { db, service } = fixture();
    db.when(/FROM "api_message_attachments" a JOIN "api_messages"/u, [
      { artifact_id: 'artifact', messages: '3', conversations: '2' },
    ]);

    await expect(service.get(principal, 'artifact')).resolves.toMatchObject({
      id: 'artifact',
      usage: { messages: 3, conversations: 2 },
    });
    const where = (
      db.repository(ArtifactEntity).findOne.mock.calls[0]?.[0] as { where: Record<string, unknown> }
    ).where;
    expect(where).toMatchObject({ id: 'artifact', tenantId: 'tenant', ownerUserId: 'owner' });
    expect(where).toHaveProperty('deletedAt');
  });

  it('answers a missing or foreign file with the same not-found', async () => {
    await expect(fixture(null).service.get(principal, 'artifact')).rejects.toMatchObject({
      code: 'file_not_found',
    });
  });

  it('reports the quota as used, reserved and limit', async () => {
    const { db, service } = fixture();
    db.when(/FROM "api_artifact_contents"/u, [{ used: '40', reserved: '15' }]);

    await expect(service.quota(principal)).resolves.toEqual({
      usedBytes: 40,
      reservedBytes: 15,
      limitBytes: 100,
      maxFileBytes: 50,
    });
  });

  it('builds the list from the owner scope and every requested filter', async () => {
    paginated.calls.length = 0;
    const where = vi.fn().mockReturnThis();
    const andWhere = vi.fn().mockReturnThis();
    const { db, service } = fixture();
    Object.assign(db.repository(ArtifactEntity), {
      createQueryBuilder: () => ({ where, andWhere }),
    });

    await service.list(principal, {
      search: ' 100%_vrai ',
      kind: 'pdf',
      readiness: 'ready',
      folderId: 'root',
      tag: 'finance',
      conversationId: 'conversation',
      cursor: 'c',
      limit: 5,
    });

    expect(where).toHaveBeenCalledWith(expect.stringContaining('ownerUserId'), scope);
    const clauses = andWhere.mock.calls.map(([clause]) => String(clause));
    expect(clauses).toEqual([
      'artifact.deletedAt IS NULL',
      expect.stringContaining('ILIKE'),
      'artifact.kind = :kind',
      'artifact.readiness = :readiness',
      'artifact.folderId IS NULL',
      expect.stringContaining('@>'),
      expect.stringContaining('EXISTS'),
    ]);
    // LIKE wildcards typed by the user are matched literally.
    expect(andWhere.mock.calls[1]?.[1]).toEqual({ search: '%100\\%\\_vrai%' });
    expect(paginated.calls[0]?.[1]).toEqual({ cursor: 'c', limit: 5, sortColumn: 'created_at' });

    andWhere.mockClear();
    await service.list(principal, { folderId: 'folder', search: '   ' });
    expect(andWhere.mock.calls.map(([clause]) => String(clause))).toEqual([
      'artifact.deletedAt IS NULL',
      'artifact.folderId = :folderId',
    ]);
  });

  it('renames keeping the extension, cleans tags and clears a blank description', async () => {
    const { db, service } = fixture();

    const updated = await service.update(principal, 'artifact', {
      name: '  Avenant n°2  ',
      tags: [' juridique ', 'juridique', ''],
      description: '   ',
    });

    expect(updated).toMatchObject({
      name: 'Avenant n°2.pdf',
      tags: ['juridique'],
      description: null,
    });
    expect(db.repository(ArtifactEntity).update).toHaveBeenCalledWith(
      { id: 'artifact', ...scope },
      expect.objectContaining({ name: 'Avenant n°2.pdf', nameKey: 'avenant n°2.pdf' }),
    );
  });

  it('refuses an invalid name, an unknown folder and a name already taken there', async () => {
    await expect(
      fixture().service.update(principal, 'artifact', { name: '..' }),
    ).rejects.toMatchObject({ code: 'invalid_name' });

    const noFolder = fixture();
    noFolder.db.repository(ArtifactFolderEntity).existsBy.mockResolvedValue(false);
    await expect(
      noFolder.service.update(principal, 'artifact', { folderId: 'folder' }),
    ).rejects.toMatchObject({ code: 'folder_not_found' });

    const taken = fixture();
    taken.db.when(/"name_key" = \$4/u, [{}]);
    await expect(
      taken.service.update(principal, 'artifact', { folderId: null }),
    ).rejects.toMatchObject({ code: 'file_name_conflict', status: 409 });
  });

  it('writes nothing when nothing changes', async () => {
    const { db, service } = fixture();

    await service.update(principal, 'artifact', {});

    expect(db.repository(ArtifactEntity).update).not.toHaveBeenCalled();
  });

  it('refuses to delete a file an answer is using', async () => {
    const { db, collector, service } = fixture();
    db.when(/execution\."finished_at" IS NULL/u, [{}]);

    await expect(service.remove(principal, 'artifact')).rejects.toMatchObject({
      code: 'file_in_use',
      status: 409,
    });
    expect(db.repository(ArtifactEntity).update).not.toHaveBeenCalled();
    expect(collector.nudge).not.toHaveBeenCalled();
  });

  it('deletes by leaving a tombstone, erasing the text and handing the bytes to the collector', async () => {
    const { db, collector, service } = fixture();

    await service.remove(principal, 'artifact');

    expect(db.repository(ArtifactEntity).update).toHaveBeenCalledWith(
      { id: 'artifact', ...scope },
      { deletedAt: expect.any(Date) as Date, folderId: null },
    );
    expect(db.ran(/UPDATE "api_artifact_extractions" e SET "text" = NULL/u)).toBe(true);
    expect(db.ran(/UPDATE "api_artifact_contents" c SET "state" = 'purging'/u)).toBe(true);
    // No row of a message attachment is ever deleted.
    expect(db.ran(/DELETE FROM "api_message_attachments"/u)).toBe(false);
    expect(collector.nudge).toHaveBeenCalledOnce();
  });

  it('serves the original and the reduced copy from the store', async () => {
    const { db, store, service } = fixture();
    db.when(/FROM "api_artifact_revisions" r\s+JOIN "api_artifact_contents" c/u, [
      { content_id: 'original' },
    ]).when(/JOIN "api_artifact_extractions" e/u, [
      { content_id: 'reduced', media_type: 'image/jpeg' },
    ]);

    await expect(service.content(principal, 'artifact')).resolves.toEqual({
      bytes: Buffer.from('bytes'),
      mediaType: 'application/pdf',
      name: 'Contrat.pdf',
    });
    await expect(service.preview(principal, 'artifact')).resolves.toMatchObject({
      mediaType: 'image/jpeg',
    });
    expect(store.get.mock.calls.map(([id]) => id as string)).toEqual(['original', 'reduced']);
  });

  it('says the content is gone, and that a document has no preview', async () => {
    const gone = fixture();
    gone.store.get.mockResolvedValue(null);
    gone.db.when(/FROM "api_artifact_revisions"/u, [{ content_id: 'original' }]);
    await expect(gone.service.content(principal, 'artifact')).rejects.toMatchObject({
      code: 'file_content_purged',
      status: 410,
    });

    await expect(fixture().service.content(principal, 'artifact')).rejects.toMatchObject({
      code: 'file_content_purged',
    });
    await expect(fixture().service.preview(principal, 'artifact')).rejects.toMatchObject({
      code: 'file_not_found',
      status: 404,
    });
  });
});
