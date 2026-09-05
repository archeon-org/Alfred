import { UnauthorizedException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import type { OauthLoginStateEntity } from '../../src/modules/auth/entities/oauth-login-state.entity';
import { OauthStateService } from '../../src/modules/auth/services/oauth-state.service';

function persistedState(overrides: Partial<OauthLoginStateEntity> = {}): OauthLoginStateEntity {
  return {
    codeVerifier: 'code-verifier',
    consumedAt: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    nonce: 'nonce',
    returnTo: '/app/team',
    stateHash: 'a'.repeat(64),
    ...overrides,
  };
}

describe('OauthStateService', () => {
  it('persists only a hash of the browser state challenge', async () => {
    const create = vi.fn((value: Partial<OauthLoginStateEntity>) => value as OauthLoginStateEntity);
    const repository = {
      create,
      delete: vi.fn().mockResolvedValue({ affected: 0 }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const service = new OauthStateService({
      getRepository: vi.fn().mockReturnValue(repository),
    } as unknown as DataSource);

    const rawState = await service.create({
      codeVerifier: 'code-verifier',
      nonce: 'nonce',
      returnTo: '/app/team',
    });

    expect(rawState).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
    const persisted = create.mock.calls[0]?.[0];
    expect(persisted?.stateHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(create.mock.calls)).not.toContain(rawState);
    expect(repository.delete).toHaveBeenCalledOnce();
  });

  it('consumes a matching unexpired state exactly once under a database lock', async () => {
    const state = persistedState();
    const repository = {
      findOne: vi.fn().mockResolvedValue(state),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      transaction: vi.fn((work: (manager: EntityManager) => unknown) =>
        Promise.resolve(work({ getRepository: () => repository } as unknown as EntityManager)),
      ),
    } as unknown as DataSource;
    const service = new OauthStateService(dataSource);

    await expect(service.consume('matching-state', 'matching-state')).resolves.toMatchObject({
      ...state,
      consumedAt: expect.any(Date),
    });
    expect(repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(repository.update).toHaveBeenCalledWith(
      { stateHash: state.stateHash },
      { consumedAt: expect.any(Date) },
    );
  });

  it('rejects cookie mismatches before querying persistence', async () => {
    const transaction = vi.fn();
    const service = new OauthStateService({ transaction } as unknown as DataSource);

    await expect(service.consume('query-state', undefined)).rejects.toThrow(UnauthorizedException);
    await expect(service.consume('query-state', 'other-state')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('deletes and rejects an expired state', async () => {
    const repository = {
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      findOne: vi.fn().mockResolvedValue(persistedState({ expiresAt: new Date(0) })),
    };
    const service = new OauthStateService({
      transaction: vi.fn((work: (manager: EntityManager) => unknown) =>
        Promise.resolve(work({ getRepository: () => repository } as unknown as EntityManager)),
      ),
    } as unknown as DataSource);

    await expect(service.consume('matching-state', 'matching-state')).rejects.toThrow(
      'Expired or reused OAuth state',
    );
    expect(repository.delete).toHaveBeenCalledOnce();
  });
});
