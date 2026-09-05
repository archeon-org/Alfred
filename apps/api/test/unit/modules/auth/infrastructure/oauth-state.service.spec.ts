import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import type { OauthLoginStateEntity } from '@api/modules/auth/infrastructure/persistence/entities/oauth-login-state.entity';
import { OauthStateService } from '@api/modules/auth/infrastructure/persistence/oauth-state.service';

function hashState(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function persistedState(overrides: Partial<OauthLoginStateEntity> = {}): OauthLoginStateEntity {
  return {
    consumedAt: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    providerContext: { codeVerifier: 'code-verifier', nonce: 'nonce' },
    providerKey: 'google',
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
      providerContext: { codeVerifier: 'code-verifier', nonce: 'nonce' },
      providerKey: 'google',
      returnTo: '/app/team',
    });

    expect(rawState).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
    const persisted = create.mock.calls[0]?.[0];
    expect(persisted?.stateHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(create.mock.calls)).not.toContain(rawState);
    expect(repository.delete).toHaveBeenCalledOnce();
  });

  it('consumes a matching unexpired state exactly once under a database lock', async () => {
    const state = persistedState({ stateHash: hashState('matching-state') });
    const update = vi
      .fn<
        (
          criteria: Partial<OauthLoginStateEntity>,
          value: Partial<OauthLoginStateEntity>,
        ) => Promise<{ affected: number }>
      >()
      .mockResolvedValue({ affected: 1 });
    const repository = {
      findOne: vi.fn().mockResolvedValue(state),
      update,
    };
    const dataSource = {
      transaction: vi.fn((work: (manager: EntityManager) => unknown) =>
        Promise.resolve(work({ getRepository: () => repository } as unknown as EntityManager)),
      ),
    } as unknown as DataSource;
    const service = new OauthStateService(dataSource);

    const consumed = await service.consume('google', 'matching-state', 'matching-state');

    expect(consumed).toMatchObject({
      expiresAt: state.expiresAt,
      providerContext: state.providerContext,
      providerKey: 'google',
      returnTo: state.returnTo,
      stateHash: state.stateHash,
    });
    expect(consumed.consumedAt).toBeInstanceOf(Date);
    expect(repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(update).toHaveBeenCalledOnce();
    const updateCall = update.mock.calls[0];
    expect(updateCall?.[0]).toEqual({ stateHash: state.stateHash });
    expect(updateCall?.[1].consumedAt).toBeInstanceOf(Date);
  });

  it('rejects cookie mismatches before querying persistence', async () => {
    const transaction = vi.fn();
    const service = new OauthStateService({ transaction } as unknown as DataSource);

    await expect(service.consume('google', 'query-state', undefined)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.consume('google', 'query-state', 'other-state')).rejects.toThrow(
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

    await expect(service.consume('google', 'matching-state', 'matching-state')).rejects.toThrow(
      'Expired or reused OAuth state',
    );
    expect(repository.delete).toHaveBeenCalledOnce();
  });

  it('rejects a callback presented to a different provider without consuming the state', async () => {
    const state = persistedState({ stateHash: hashState('matching-state') });
    const repository = {
      findOne: vi.fn().mockResolvedValue(state),
      update: vi.fn(),
    };
    const service = new OauthStateService({
      transaction: vi.fn((work: (manager: EntityManager) => unknown) =>
        Promise.resolve(work({ getRepository: () => repository } as unknown as EntityManager)),
      ),
    } as unknown as DataSource);

    await expect(service.consume('microsoft', 'matching-state', 'matching-state')).rejects.toThrow(
      'OAuth state does not match the provider',
    );
    expect(repository.update).not.toHaveBeenCalled();
  });
});
