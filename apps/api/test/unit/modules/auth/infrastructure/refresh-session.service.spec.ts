import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import type { RefreshSessionEntity } from '@api/modules/auth/infrastructure/persistence/entities/refresh-session.entity';
import { RefreshSessionService } from '@api/modules/auth/infrastructure/persistence/refresh-session.service';
import type { SessionTokenService } from '@api/modules/auth/infrastructure/security/session-token.service';
import type { UserEntity } from '@api/modules/users/user.entity';

const user = {
  avatarUrl: null,
  createdAt: new Date('2026-09-03T10:00:00.000Z'),
  displayName: 'Alfred User',
  email: 'person@example.test',
  id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
  identities: [],
  lastLoginAt: new Date('2026-09-03T10:00:00.000Z'),
  refreshSessions: [],
  role: 'user',
  status: 'active',
  updatedAt: new Date('2026-09-03T10:00:00.000Z'),
} satisfies UserEntity;

function tokenService() {
  return {
    createRefreshToken: vi.fn().mockReturnValue({ hash: 'b'.repeat(64), raw: 'next-token' }),
    hashRefreshToken: vi.fn().mockReturnValue('a'.repeat(64)),
    issueAccessToken: vi.fn().mockResolvedValue('access-token'),
  };
}

function configService() {
  return {
    getOrThrow: vi.fn().mockReturnValue(3600),
  } as unknown as ConfigService;
}

function currentSession(overrides: Partial<RefreshSessionEntity> = {}): RefreshSessionEntity {
  return {
    createdAt: new Date('2026-09-03T10:00:00.000Z'),
    expiresAt: new Date(Date.now() + 60_000),
    familyId: '1fa505e2-852f-457b-8955-0d104f3c0ee4',
    id: '82d76f0c-b0f4-4f01-8a9d-0ea09f506cb8',
    replacedBySession: null,
    replacedBySessionId: null,
    revokedAt: null,
    rotatedAt: null,
    tokenHash: 'a'.repeat(64),
    user,
    userId: user.id,
    ...overrides,
  };
}

describe('RefreshSessionService', () => {
  it('stores only the refresh-token hash and returns a short-lived access token', async () => {
    const create = vi.fn((value: Partial<RefreshSessionEntity>) => value as RefreshSessionEntity);
    const save = vi.fn((value: RefreshSessionEntity) =>
      Promise.resolve({ ...value, id: currentSession().id }),
    );
    const repository = {
      create,
      save,
    };
    const dataSource = {
      getRepository: vi.fn().mockReturnValue(repository),
    } as unknown as DataSource;
    const tokens = tokenService();
    const service = new RefreshSessionService(
      dataSource,
      tokens as unknown as SessionTokenService,
      configService(),
    );

    await expect(service.create(user)).resolves.toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'next-token',
      user: { email: user.email, id: user.id },
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: 'b'.repeat(64), userId: user.id }),
    );
    expect(JSON.stringify(repository.create.mock.calls)).not.toContain('next-token');
  });

  it('does not persist a new session when access-token signing fails', async () => {
    const repository = {
      create: vi.fn((value: Partial<RefreshSessionEntity>) => value as RefreshSessionEntity),
      save: vi.fn(),
    };
    const dataSource = {
      getRepository: vi.fn().mockReturnValue(repository),
    } as unknown as DataSource;
    const tokens = tokenService();
    tokens.issueAccessToken.mockRejectedValueOnce(new Error('signing unavailable'));
    const service = new RefreshSessionService(
      dataSource,
      tokens as unknown as SessionTokenService,
      configService(),
    );

    await expect(service.create(user)).rejects.toThrow('signing unavailable');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rotates a valid token atomically and links the replacement session', async () => {
    const current = currentSession();
    const create = vi.fn((value: Partial<RefreshSessionEntity>) => value as RefreshSessionEntity);
    const save = vi.fn((value: RefreshSessionEntity) =>
      Promise.resolve({ ...value, id: 'f05b74a4-f6b1-4cb7-bfd4-c6176799aba8' }),
    );
    const update = vi
      .fn<
        (
          criteria: Partial<RefreshSessionEntity>,
          value: Partial<RefreshSessionEntity>,
        ) => Promise<{ affected: number }>
      >()
      .mockResolvedValue({ affected: 1 });
    const repository = {
      create,
      findOne: vi.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(current),
      findOneBy: vi.fn().mockResolvedValue(user),
      save,
      update,
    };
    const query = vi.fn().mockResolvedValue([]);
    const dataSource = {
      transaction: vi.fn((work: (manager: EntityManager) => unknown) =>
        Promise.resolve(
          work({ getRepository: () => repository, query } as unknown as EntityManager),
        ),
      ),
    } as unknown as DataSource;
    const tokens = tokenService();
    const service = new RefreshSessionService(
      dataSource,
      tokens as unknown as SessionTokenService,
      configService(),
    );

    await expect(service.rotate('current-token')).resolves.toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'next-token',
    });
    expect(repository.findOne).toHaveBeenNthCalledWith(1, { where: { tokenHash: 'a'.repeat(64) } });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
      current.familyId,
    ]);
    expect(repository.findOne).toHaveBeenNthCalledWith(2, {
      lock: { mode: 'pessimistic_write' },
      where: { id: current.id },
    });
    expect(repository.findOneBy).toHaveBeenCalledWith({ id: user.id });
    const rotationUpdate = update.mock.calls.find(([criteria]) => criteria.id === current.id);
    expect(rotationUpdate?.[1].replacedBySessionId).toEqual(expect.any(String));
  });

  it('does not rotate the persisted session when access-token signing fails', async () => {
    const repository = {
      create: vi.fn((value: Partial<RefreshSessionEntity>) => value as RefreshSessionEntity),
      findOne: vi
        .fn()
        .mockResolvedValueOnce(currentSession())
        .mockResolvedValueOnce(currentSession()),
      findOneBy: vi.fn().mockResolvedValue(user),
      save: vi.fn(),
      update: vi.fn(),
    };
    const query = vi.fn().mockResolvedValue([]);
    const dataSource = {
      transaction: vi.fn((work: (manager: EntityManager) => unknown) =>
        Promise.resolve(
          work({ getRepository: () => repository, query } as unknown as EntityManager),
        ),
      ),
    } as unknown as DataSource;
    const tokens = tokenService();
    tokens.issueAccessToken.mockRejectedValueOnce(new Error('signing unavailable'));
    const service = new RefreshSessionService(
      dataSource,
      tokens as unknown as SessionTokenService,
      configService(),
    );

    await expect(service.rotate('current-token')).rejects.toThrow('signing unavailable');
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('revokes the whole token family when a rotated token is replayed', async () => {
    const replayed = currentSession({ rotatedAt: new Date() });
    const update = vi
      .fn<
        (
          criteria: Partial<RefreshSessionEntity>,
          value: Partial<RefreshSessionEntity>,
        ) => Promise<{ affected: number }>
      >()
      .mockResolvedValue({ affected: 2 });
    const repository = {
      findOne: vi.fn().mockResolvedValueOnce(replayed).mockResolvedValueOnce(replayed),
      findOneBy: vi.fn().mockResolvedValue(user),
      update,
    };
    const query = vi.fn().mockResolvedValue([]);
    const dataSource = {
      transaction: vi.fn((work: (manager: EntityManager) => unknown) =>
        Promise.resolve(
          work({ getRepository: () => repository, query } as unknown as EntityManager),
        ),
      ),
    } as unknown as DataSource;
    const service = new RefreshSessionService(
      dataSource,
      tokenService() as unknown as SessionTokenService,
      configService(),
    );

    await expect(service.rotate('replayed-token')).rejects.toThrow(UnauthorizedException);
    const updateCall = update.mock.calls[0];
    expect(updateCall?.[0]).toEqual({ familyId: replayed.familyId });
    expect(updateCall?.[1].revokedAt).toBeInstanceOf(Date);
  });

  it('detects replay from a rotated tombstone even after that token expires', async () => {
    const replayed = currentSession({
      expiresAt: new Date(0),
      revokedAt: new Date(),
      rotatedAt: new Date(),
    });
    const update = vi
      .fn<
        (
          criteria: Partial<RefreshSessionEntity>,
          value: Partial<RefreshSessionEntity>,
        ) => Promise<{ affected: number }>
      >()
      .mockResolvedValue({ affected: 2 });
    const repository = {
      findOne: vi.fn().mockResolvedValueOnce(replayed).mockResolvedValueOnce(replayed),
      update,
    };
    const query = vi.fn().mockResolvedValue([]);
    const dataSource = {
      transaction: vi.fn((work: (manager: EntityManager) => unknown) =>
        Promise.resolve(
          work({ getRepository: () => repository, query } as unknown as EntityManager),
        ),
      ),
    } as unknown as DataSource;
    const service = new RefreshSessionService(
      dataSource,
      tokenService() as unknown as SessionTokenService,
      configService(),
    );

    await expect(service.rotate('replayed-token')).rejects.toThrow('Refresh token reuse detected');
    const replayUpdate = update.mock.calls[0];
    expect(replayUpdate?.[0]).toEqual({ familyId: replayed.familyId });
    expect(replayUpdate?.[1].revokedAt).toBeInstanceOf(Date);
  });

  it('locks the presented refresh row and revokes its family in one transaction', async () => {
    const current = currentSession();
    const update = vi
      .fn<
        (
          criteria: Partial<RefreshSessionEntity>,
          value: Partial<RefreshSessionEntity>,
        ) => Promise<{ affected: number }>
      >()
      .mockResolvedValue({ affected: 2 });
    const repository = {
      findOne: vi.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(current),
      update,
    };
    const query = vi.fn().mockResolvedValue([]);
    const manager = { getRepository: vi.fn().mockReturnValue(repository), query };
    const getRepository = vi.fn();
    const dataSource = {
      getRepository,
      transaction: vi.fn((work: (transactionManager: EntityManager) => unknown) =>
        Promise.resolve(work(manager as unknown as EntityManager)),
      ),
    } as unknown as DataSource;
    const service = new RefreshSessionService(
      dataSource,
      tokenService() as unknown as SessionTokenService,
      configService(),
    );

    await expect(service.revoke('current-token')).resolves.toBeUndefined();
    expect(getRepository).not.toHaveBeenCalled();
    expect(repository.findOne).toHaveBeenNthCalledWith(1, {
      select: { familyId: true, id: true },
      where: { tokenHash: 'a'.repeat(64) },
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
      current.familyId,
    ]);
    expect(repository.findOne).toHaveBeenNthCalledWith(2, {
      lock: { mode: 'pessimistic_write' },
      select: { familyId: true, id: true },
      where: { id: current.id },
    });
    const revokeUpdate = update.mock.calls[0];
    expect(revokeUpdate?.[0]).toEqual({ familyId: current.familyId });
    expect(revokeUpdate?.[1].revokedAt).toBeInstanceOf(Date);
  });

  it('rejects expired sessions before issuing any new access token', async () => {
    const repository = {
      findOne: vi
        .fn()
        .mockResolvedValueOnce(currentSession({ expiresAt: new Date(0) }))
        .mockResolvedValueOnce(currentSession({ expiresAt: new Date(0) })),
    };
    const query = vi.fn().mockResolvedValue([]);
    const dataSource = {
      transaction: vi.fn((work: (manager: EntityManager) => unknown) =>
        Promise.resolve(
          work({ getRepository: () => repository, query } as unknown as EntityManager),
        ),
      ),
    } as unknown as DataSource;
    const tokens = tokenService();
    const service = new RefreshSessionService(
      dataSource,
      tokens as unknown as SessionTokenService,
      configService(),
    );

    await expect(service.rotate('expired-token')).rejects.toThrow('Invalid refresh session');
    expect(tokens.issueAccessToken).not.toHaveBeenCalled();
  });
});
