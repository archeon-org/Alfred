import { describe, expect, it, vi } from 'vitest';

import {
  deleteOwnedOrThrow,
  findOwnedOrThrow,
  updateOwnedOrThrow,
} from '@api/common/ownership/find-owned';

const ownership = { id: 'resource-1', ownerUserId: 'user-1', tenantId: 'tenant-1' };

describe('tenant-rooted ownership predicate', () => {
  it('adds the tenant to every read, lock, update and delete predicate', async () => {
    const repository = {
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      findOne: vi.fn().mockResolvedValue({ ...ownership }),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    await findOwnedOrThrow(repository, ownership, 'project', {
      lock: { mode: 'pessimistic_write' },
    });
    await updateOwnedOrThrow(repository, ownership, { name: 'x' }, 'project');
    await deleteOwnedOrThrow(repository, ownership, 'project');

    expect(repository.findOne).toHaveBeenCalledWith({
      lock: { mode: 'pessimistic_write' },
      where: ownership,
    });
    expect(repository.update).toHaveBeenCalledWith(ownership, { name: 'x' });
    expect(repository.delete).toHaveBeenCalledWith(ownership);
  });

  it('fails closed on a blank tenant and refuses tenant reassignment', async () => {
    const repository = {
      findOne: vi.fn().mockResolvedValue({ ...ownership }),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    await expect(
      findOwnedOrThrow(repository, { ...ownership, tenantId: ' ' }, 'project'),
    ).rejects.toMatchObject({ code: 'project_not_found' });
    expect(repository.findOne).not.toHaveBeenCalled();
    await expect(
      updateOwnedOrThrow(repository, ownership, { tenantId: 'other' } as never, 'project'),
    ).rejects.toMatchObject({ code: 'invalid_update' });
    await expect(
      updateOwnedOrThrow(repository, ownership, { tenant_id: 'other' } as never, 'project'),
    ).rejects.toMatchObject({ code: 'invalid_update' });
  });

  it('keeps the tenant-less predicate for resources without a tenant root', async () => {
    const repository = { findOne: vi.fn().mockResolvedValue({ id: 'r', ownerUserId: 'u' }) };

    await findOwnedOrThrow(repository, { id: 'r', ownerUserId: 'u' }, 'note');

    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 'r', ownerUserId: 'u' } });
  });
});
