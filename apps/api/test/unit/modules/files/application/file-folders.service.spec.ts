import { FOLDER_MAX_COUNT } from '@alfred/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { AuthPrincipal } from '@api/common/auth/auth-principal';
import { FileFoldersService } from '@api/modules/files/application/file-folders.service';
import { ArtifactFolderEntity } from '@api/modules/files/infrastructure/persistence/artifact-folder.entity';
import type { TenantsService } from '@api/modules/tenants/tenants.service';
import { FakeDb } from '../../../../support/fake-db';

const principal = { id: 'owner' } as AuthPrincipal;
const scope = { tenantId: 'tenant', ownerUserId: 'owner' };
const now = new Date('2026-09-18T10:00:00Z');
const folder = (overrides: Partial<ArtifactFolderEntity> = {}) =>
  ({
    id: 'folder',
    ...scope,
    parentId: null,
    name: 'Contrats',
    nameKey: 'contrats',
    depth: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }) as ArtifactFolderEntity;

function fixture() {
  const db = new FakeDb();
  const folders = db.repository(ArtifactFolderEntity);
  folders.save.mockImplementation((value: unknown) =>
    Promise.resolve({ ...(value as object), id: 'created', createdAt: now, updatedAt: now }),
  );
  const service = new FileFoldersService(db.asDataSource(), {
    scopeFor: vi.fn().mockResolvedValue(scope),
  } as unknown as TenantsService);
  return { db, folders, service };
}

describe('FileFoldersService', () => {
  it('lists the whole tree with the number of files in each folder', async () => {
    const { db, folders, service } = fixture();
    folders.find.mockResolvedValue([
      folder(),
      folder({ id: 'child', parentId: 'folder', depth: 2 }),
    ]);
    db.when(/GROUP BY "folder_id"/u, [{ folder_id: 'child', files: '4' }]);

    const tree = await service.list(principal);

    expect(tree.map((item) => [item.id, item.depth, item.fileCount])).toEqual([
      ['folder', 1, 0],
      ['child', 2, 4],
    ]);
  });

  it('creates a folder at the top level or under an owned parent', async () => {
    const { folders, service } = fixture();
    await expect(service.create(principal, { name: '  Contrats  ' })).resolves.toMatchObject({
      name: 'Contrats',
      depth: 1,
      parentId: null,
      fileCount: 0,
    });

    folders.findOne.mockResolvedValue(folder({ depth: 3 }));
    await expect(
      service.create(principal, { name: '2026', parentId: 'folder' }),
    ).resolves.toMatchObject({ depth: 4, parentId: 'folder' });
  });

  it('refuses an invalid name, a full library, too deep a tree, a foreign parent and a clash', async () => {
    await expect(fixture().service.create(principal, { name: ' .. ' })).rejects.toMatchObject({
      code: 'invalid_name',
    });

    const full = fixture();
    full.folders.countBy.mockResolvedValue(FOLDER_MAX_COUNT);
    await expect(full.service.create(principal, { name: 'x' })).rejects.toMatchObject({
      code: 'folder_limit_reached',
    });

    const deep = fixture();
    deep.folders.findOne.mockResolvedValue(folder({ depth: 8 }));
    await expect(
      deep.service.create(principal, { name: 'x', parentId: 'folder' }),
    ).rejects.toMatchObject({ code: 'folder_depth_exceeded' });

    await expect(
      fixture().service.create(principal, { name: 'x', parentId: 'foreign' }),
    ).rejects.toMatchObject({ code: 'folder_not_found' });

    const clash = fixture();
    clash.db.when(/"name_key" = \$4/u, [{}]);
    await expect(clash.service.create(principal, { name: 'Contrats' })).rejects.toMatchObject({
      code: 'folder_name_conflict',
      status: 409,
    });
  });

  it('renames in place without recomputing depths', async () => {
    const { db, folders, service } = fixture();
    folders.findOne.mockResolvedValue(folder());

    await expect(service.update(principal, 'folder', { name: 'Archives' })).resolves.toMatchObject({
      name: 'Archives',
      depth: 1,
    });
    expect(db.ran(/WITH RECURSIVE/u)).toBe(false);
  });

  it('moves a subtree and shifts every descendant depth', async () => {
    const { db, folders, service } = fixture();
    folders.findOne
      .mockResolvedValueOnce(folder({ id: 'moved', depth: 1 }))
      .mockResolvedValueOnce(folder({ id: 'target', depth: 2 }));
    db.when(/WITH RECURSIVE subtree/u, [
      { id: 'moved', depth: 1 },
      { id: 'child', depth: 2 },
    ]);

    await expect(service.update(principal, 'moved', { parentId: 'target' })).resolves.toMatchObject(
      { depth: 3, parentId: 'target' },
    );
    expect(db.parametersOf(/WITH RECURSIVE descendants/u)).toEqual(['moved', 2]);
  });

  it('refuses to move a folder into itself or its descendants, or too deep', async () => {
    const cycle = fixture();
    cycle.folders.findOne.mockResolvedValue(folder({ id: 'moved' }));
    cycle.db.when(/WITH RECURSIVE subtree/u, [
      { id: 'moved', depth: 1 },
      { id: 'child', depth: 2 },
    ]);
    await expect(
      cycle.service.update(principal, 'moved', { parentId: 'child' }),
    ).rejects.toMatchObject({ code: 'folder_cycle' });

    const deep = fixture();
    deep.folders.findOne
      .mockResolvedValueOnce(folder({ id: 'moved', depth: 1 }))
      .mockResolvedValueOnce(folder({ id: 'target', depth: 6 }));
    deep.db.when(/WITH RECURSIVE subtree/u, [
      { id: 'moved', depth: 1 },
      { id: 'grandchild', depth: 3 },
    ]);
    await expect(
      deep.service.update(principal, 'moved', { parentId: 'target' }),
    ).rejects.toMatchObject({ code: 'folder_depth_exceeded' });
  });

  it('deletes only an empty folder', async () => {
    const occupied = fixture();
    occupied.folders.findOne.mockResolvedValue(folder());
    occupied.db.when(/UNION ALL/u, [{}]);
    await expect(occupied.service.remove(principal, 'folder')).rejects.toMatchObject({
      code: 'folder_not_empty',
      status: 409,
    });
    expect(occupied.folders.delete).not.toHaveBeenCalled();

    const empty = fixture();
    empty.folders.findOne.mockResolvedValue(folder());
    await empty.service.remove(principal, 'folder');
    expect(empty.folders.delete).toHaveBeenCalledWith({ id: 'folder', ...scope });
  });
});
