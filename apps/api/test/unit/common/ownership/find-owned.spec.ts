import { NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  findOwnedOrThrow,
  updateOwnedOrThrow,
  deleteOwnedOrThrow,
} from '@api/common/ownership/find-owned';
import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';

const owner = { id: 'project-id', ownerUserId: 'owner-id' };
function repository() {
  return { findOne: vi.fn(), update: vi.fn(), delete: vi.fn() };
}

describe('owned resources', () => {
  it('fetches only by id AND owner in a single query', async () => {
    const repo = repository();
    const project = { ...owner, name: 'Project' };
    repo.findOne.mockResolvedValue(project);
    await expect(findOwnedOrThrow(repo, owner, 'project')).resolves.toBe(project);
    expect(repo.findOne).toHaveBeenCalledExactlyOnceWith({ where: owner });
  });
  it.each(['missing', 'foreign'])('returns the same 404 body for a %s resource', async () => {
    const repo = repository();
    repo.findOne.mockResolvedValue(null);
    const error = await findOwnedOrThrow(repo, owner, 'project').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(NotFoundException);
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    new ApiExceptionFilter().catch(error, {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'project_not_found', message: 'Project not found.' },
    });
  });
  it('updates with the ownership predicate and rejects zero affected rows', async () => {
    const repo = repository();
    repo.update.mockResolvedValue({ affected: 0 });
    await expect(
      updateOwnedOrThrow(repo, owner, { name: 'New' }, 'project'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.update).toHaveBeenCalledExactlyOnceWith(owner, { name: 'New' });
    expect(repo.findOne).not.toHaveBeenCalled();
  });
  it('updates and deletes only one owned row', async () => {
    const repo = repository();
    repo.update.mockResolvedValue({ affected: 1 });
    repo.delete.mockResolvedValue({ affected: 1 });
    await expect(
      updateOwnedOrThrow(repo, owner, { name: 'New' }, 'project'),
    ).resolves.toBeUndefined();
    await expect(deleteOwnedOrThrow(repo, owner, 'project')).resolves.toBeUndefined();
    expect(repo.delete).toHaveBeenCalledExactlyOnceWith(owner);
  });
  it.each([0, null, undefined, 2])(
    'rejects an unconfirmed mutation count: %s',
    async (affected) => {
      const repo = repository();
      repo.delete.mockResolvedValue({ affected });
      await expect(deleteOwnedOrThrow(repo, owner, 'project')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    },
  );
  it('propagates storage errors without turning them into missing resources', async () => {
    const repo = repository();
    repo.findOne.mockRejectedValue(new Error('database failure'));
    await expect(findOwnedOrThrow(repo, owner, 'project')).rejects.toThrow('database failure');
  });
});

describe('ownership predicate validation', () => {
  it('never lets TypeORM drop an absent ownership field', async () => {
    const repo = repository();
    await expect(
      findOwnedOrThrow(
        repo,
        { ...owner, ownerUserId: undefined } as unknown as typeof owner,
        'project',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findOne).not.toHaveBeenCalled();
  });
  it('does not transfer ownership or rewrite the identity via an update payload', async () => {
    const repo = repository();
    await expect(
      updateOwnedOrThrow(repo, owner, { ownerUserId: 'another-owner' }, 'project'),
    ).rejects.toThrow('Ownership and identity cannot be changed.');
    expect(repo.update).not.toHaveBeenCalled();
  });
});
